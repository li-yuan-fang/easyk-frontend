import { getCurrentInstance, getCurrentScope, onScopeDispose } from 'vue'
import type { App } from 'vue'
import type { BookListItem } from './book_interfaces'

const STATE_URL = '/api/state'
const SSE_MAX_CONSECUTIVE_FAILURES = 3
const SSE_RETRY_INTERVAL_MS = 2000
const GET_POLL_INTERVAL_MS = 5000
const SSE_RECOVERY_GET_COUNT = 6
const SSE_CONNECT_TIMEOUT_MS = 10000
const GET_TIMEOUT_MS = 10000

export {
    reload,
    getId,
    getSnapshot,
    seek,
    push,
    pause,
    usePush,
    useLoaded,
    usePlaying,
    PlayState,
    type PlayerState,
    type EasyKState,
}

enum PlayState {
    Stopped = 0,
    Playing = 1,
    Paused = 2,
}

interface PlayerState {
    state: PlayState
    /** 总时长，单位为秒。 */
    duration: number
    /** 播放进度比例，取值范围为 [0, 1]。 */
    current: number
    /** 播放倍速，必须为有限正数，1 表示正常速度；暂停时保留原值。 */
    rate: number
}

interface EasyKState {
    media?: BookListItem | null
    player: PlayerState
}

interface Snapshot {
    media: BookListItem | null
    player: PlayerState
}

interface EventPayloads {
    push: Readonly<BookListItem> | null
    loaded: Readonly<PlayerState>
    playing: Readonly<Pick<PlayerState, 'state' | 'current' | 'rate'>>
}

type EventName = keyof EventPayloads
type StateEvent = {
    [K in EventName]: { type: K; data: EventPayloads[K] }
}[EventName]
type Callback<T> = (data: T) => void | Promise<void>

interface Subscription<T> {
    callback: Callback<T>
    order: number
    active: boolean
}

interface SnapshotRequest {
    promise: Promise<Snapshot>
    cancel: () => void
}

interface Connection {
    source?: EventSource
    timer?: ReturnType<typeof setTimeout>
    removeListeners?: () => void
    /** 是否为 GET 模式下发起的恢复探测。 */
    probe: boolean
    opened: boolean
    /** 自动重连成功前，是否已因异常发起过一次性 GET 同步。 */
    resyncing: boolean
    /** 当前持有的同步请求；整个断线周期内的异常只触发一次 GET 同步。 */
    resyncRequest?: SnapshotRequest
}

interface Session {
    mode: 'initializing' | 'sse' | 'get'
    snapshot?: Snapshot
    /** SSE 连续失败次数，仅在有效 open 后清零。 */
    failures: number
    /** GET 模式已完成的轮询次数，包含失败，最多保留一次探测资格。 */
    recoveryCount: number
    request?: SnapshotRequest
    connection?: Connection
    retryTimer?: ReturnType<typeof setTimeout>
    pollTimer?: ReturnType<typeof setTimeout>
    removeVisibilityListener?: () => void
}

const subscriptions: { [K in EventName]: Set<Subscription<EventPayloads[K]>> } = {
    push: new Set(),
    loaded: new Set(),
    playing: new Set(),
}
const boundApps = new WeakSet<App>()
let subscriptionOrder = 0
// 以会话对象身份区分代次，所有异步结果必须确认仍属于当前会话。
let session: Session | undefined

const report = (message: string, error: unknown): void => {
    console.warn(`[EasyK state] ${message}`, error)
}

const cancellationError = (): DOMException => {
    return new DOMException('EasyK state session was replaced or disposed', 'AbortError')
}

const isCurrent = (candidate: Session): boolean => {
    return session === candidate
}

const object = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Expected a JSON object')
    }
    return value as Record<string, unknown>
}

const mediaSource = (value: unknown): BookListItem => {
    const media = object(value)
    if (typeof media.id !== 'string' || typeof media.title !== 'string' || typeof media.order !== 'string') {
        throw new Error('Expected complete media with string id, title and order')
    }
    return { id: media.id, title: media.title, order: media.order }
}

const playState = (value: unknown): PlayState => {
    if (value !== PlayState.Stopped && value !== PlayState.Playing && value !== PlayState.Paused) {
        throw new Error('Invalid player state')
    }
    return value
}

const finiteNumber = (value: unknown, min: number, max = Infinity): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new Error('Invalid player number')
    }
    return value
}

const playbackRate = (value: unknown): number => {
    const rate = finiteNumber(value, 0)
    if (rate === 0) throw new Error('Playback rate must be positive')
    return rate
}

const playerState = (value: unknown): PlayerState => {
    const player = object(value)
    return {
        state: playState(player.state),
        duration: finiteNumber(player.duration, 0),
        current: finiteNumber(player.current, 0, 1),
        rate: playbackRate(player.rate),
    }
}

const snapshotData = (value: unknown): Snapshot => {
    const data = object(value)
    const media = data.media == null ? null : mediaSource(data.media)
    const player = playerState(data.player)
    if (media === null && (player.state !== PlayState.Stopped ||
        player.duration !== 0 || player.current !== 0 || player.rate !== 1)) {
        throw new Error('A snapshot without media must have a stopped, zeroed player with rate 1')
    }
    return { media, player }
}

const stoppedPlayer = (): PlayerState => {
    return { state: PlayState.Stopped, duration: 0, current: 0, rate: 1 }
}

// 回调数据独立复制并冻结，避免修改内部缓存或影响其他订阅者。
const pushEvent = (media: BookListItem | null): StateEvent => {
    return { type: 'push', data: media === null ? null : Object.freeze({ ...media }) }
}

const loadedEvent = (player: PlayerState): StateEvent => {
    return { type: 'loaded', data: Object.freeze({ ...player }) }
}

const playingEvent = (player: PlayerState): StateEvent => {
    return { type: 'playing', data: Object.freeze({ state: player.state, current: player.current, rate: player.rate }) }
}

const initialEvents = (snapshot: Snapshot): StateEvent[] => {
    const events = [pushEvent(snapshot.media)]
    if (snapshot.media !== null && snapshot.player.state !== PlayState.Stopped) {
        events.push(loadedEvent(snapshot.player))
    }
    return events
}

const sameMedia = (left: BookListItem | null, right: BookListItem | null): boolean => {
    return left === right || (left !== null && right !== null &&
        left.id === right.id && left.title === right.title && left.order === right.order)
}

// GET 同步与轮询共用：比对两次快照得出应补发的钩子，快照相同则返回空数组。
const snapshotEvents = (previous: Snapshot | undefined, next: Snapshot): StateEvent[] => {
    // 媒体变化和完整播放器更新优先，不能再叠加局部 playing 通知。
    if (!previous || !sameMedia(previous.media, next.media)) return initialEvents(next)
    if (next.media === null) return []

    const before = previous.player
    const after = next.player
    if (before.state === PlayState.Stopped) {
        return after.state === PlayState.Stopped ? [] : [loadedEvent(after)]
    }
    if (after.state === PlayState.Stopped) return [playingEvent(after)]
    if (before.duration !== after.duration) return [loadedEvent(after)]

    // 仅进度变化仍提交新快照，但不单独通知业务钩子。
    return before.state !== after.state || before.rate !== after.rate ? [playingEvent(after)] : []
}

// 只有这些同步异常才说明回调依赖的组件/作用域已销毁，业务逻辑自身的异常不移除订阅。
const INVALID_CALLBACK_ERRORS = ['ReferenceError', 'TypeError']
const INVALID_CALLBACK_MESSAGE = /(Cannot read propert|Cannot set propert|is not a function|Cannot access '|before initialization|is not defined|undefined \(reading|undefined \(setting)/

/** 判断回调是否因绑定的组件/作用域已销毁而不复可用；只能用于同步抛出的异常。 */
const invalidCallbackError = (error: unknown): boolean => {
    if (error === null || typeof error !== 'object') return false
    const { name, message } = error as { name?: unknown; message?: unknown }
    return typeof name === 'string' && INVALID_CALLBACK_ERRORS.includes(name) &&
        typeof message === 'string' && INVALID_CALLBACK_MESSAGE.test(message)
}

/** 注销订阅；取消后不得再从任何通道回调该订阅。 */
const removeSubscription = <K extends EventName>(type: K, subscription: Subscription<EventPayloads[K]>): void => {
    subscription.active = false
    subscriptions[type].delete(subscription)
}

/** 调用订阅回调；同步抛出失效类异常时立即注销该订阅，返回是否仍有效。 */
const invokeSubscription = <K extends EventName>(
    type: K, subscription: Subscription<EventPayloads[K]>, data: EventPayloads[K]): boolean => {
    try {
        void Promise.resolve(subscription.callback(data)).catch(error => report('Event callback rejected', error))
    } catch (error) {
        report('Event callback threw', error)
        if (invalidCallbackError(error)) {
            removeSubscription(type, subscription)
            report('Removed invalid callback subscription', error)
            return false
        }
    }
    return true
}

const notify = <K extends EventName>(owner: Session, type: K, data: EventPayloads[K], cutoff: number): void => {
    for (const subscription of [...subscriptions[type]]) {
        // 回调可能重入 reload，每次调用前都要确认旧批次仍有效。
        if (!isCurrent(owner)) return
        if (!subscription.active || subscription.order >= cutoff) continue
        // 回调已失效时由 invokeSubscription 自动移除注册，后续事件不再回调。
        if (!invokeSubscription(type, subscription, data)) continue
    }
}

const dispatch = (owner: Session, events: StateEvent[]): void => {
    // 固定本批次的订阅边界；回调中新注册的订阅只接收同步回放。
    const cutoff = subscriptionOrder
    for (const event of events) {
        if (!isCurrent(owner)) return
        switch (event.type) {
            case 'push': notify(owner, 'push', event.data, cutoff); break
            case 'loaded': notify(owner, 'loaded', event.data, cutoff); break
            case 'playing': notify(owner, 'playing', event.data, cutoff); break
        }
    }
}

const bindAppLifecycle = (): void => {
    // 从组件上下文识别所属应用，组件订阅释放与应用资源释放分别处理。
    const app = getCurrentInstance()?.appContext.app
    if (app && !boundApps.has(app)) {
        boundApps.add(app)
        app.onUnmount(dispose)
    }
}

const subscribe = <K extends EventName>(type: K, callback: Callback<EventPayloads[K]>): () => void => {
    bindAppLifecycle()
    // 同一回调对同一事件只保留一个注册；重复注册时旧注册失效，由新注册接管。
    for (const existing of [...subscriptions[type]]) {
        if (existing.callback === callback) removeSubscription(type, existing)
    }
    const subscription = { callback, active: true, order: subscriptionOrder++ }
    subscriptions[type].add(subscription)
    const unsubscribe = () => removeSubscription(type, subscription)
    if (getCurrentScope()) onScopeDispose(unsubscribe)

    const snapshot = session?.snapshot
    if (snapshot) {
        // 根据事件类型回放当前有效数据；停止状态不回放 loaded。
        const replay = replayValue(type, snapshot)
        // 回放同样走失效检查，已销毁作用域的回调直接移除注册。
        if (replay !== undefined) invokeSubscription(type, subscription, replay)
    }
    return unsubscribe
}

const replayValue = <K extends EventName>(type: K, snapshot: Snapshot): EventPayloads[K] | undefined => {
    const values: { [P in EventName]: EventPayloads[P] | undefined } = {
        push: snapshot.media === null ? null : Object.freeze({ ...snapshot.media }),
        loaded: snapshot.player.state === PlayState.Stopped ? undefined : Object.freeze({ ...snapshot.player }),
        playing: Object.freeze({ state: snapshot.player.state, current: snapshot.player.current, rate: snapshot.player.rate }),
    }
    return values[type]
}

/** 注册媒体变更回调；null 表示清空当前媒体，返回幂等的取消订阅函数。 */
const usePush = (callback: Callback<EventPayloads['push']>): () => void => {
    return subscribe('push', callback)
}

/** 注册加载完成回调，接收完整播放器信息，返回幂等的取消订阅函数。 */
const useLoaded = (callback: Callback<EventPayloads['loaded']>): () => void => {
    return subscribe('loaded', callback)
}

/** 注册播放状态回调，接收同一时刻的绝对状态、进度和倍速，返回取消订阅函数。 */
const usePlaying = (callback: Callback<EventPayloads['playing']>): () => void => {
    return subscribe('playing', callback)
}

/** 读取当前媒体 ID；没有有效快照或媒体时返回 undefined，不触发同步或事件。 */
const getId = (): string | undefined => {
    return session?.snapshot?.media?.id
}
const getSnapshot = (): Snapshot | undefined => {
    return session?.snapshot
}

/** 本地调整已加载媒体的进度；返回值仅表示本地是否受理，不发起控制请求。 */
const seek = (current: number): boolean => {
    if (typeof current !== 'number' || !Number.isFinite(current) || current < 0 || current > 1) return false
    const owner = session
    const snapshot = owner?.snapshot
    if (!owner || !snapshot || snapshot.media === null || snapshot.player.state === PlayState.Stopped) return false

    const player = { ...snapshot.player, current }
    // 先提交现有快照再通知；后续远端更新沿用原有事件系统。
    owner.snapshot = { ...snapshot, player }
    dispatch(owner, [playingEvent(player)])
    return true
}

/** 本地清空旧媒体及播放器，下一首由后续远端更新确定，不发起切歌请求。 */
const push = (): boolean => {
    const owner = session
    if (!owner?.snapshot) return false

    owner.snapshot = { media: null, player: stoppedPlayer() }
    dispatch(owner, [pushEvent(null)])
    return true
}

/** 按当前本地状态切换播放与暂停，不发起控制请求；停止或未加载时不受理。 */
const pause = (): boolean => {
    const owner = session
    const snapshot = owner?.snapshot
    if (!owner || !snapshot || snapshot.media === null || snapshot.player.state === PlayState.Stopped) return false

    const player = {
        ...snapshot.player,
        state: snapshot.player.state === PlayState.Playing ? PlayState.Paused : PlayState.Playing,
    }
    owner.snapshot = { ...snapshot, player }
    dispatch(owner, [playingEvent(player)])
    return true
}

const requestSnapshot = (): SnapshotRequest => {
    const controller = new AbortController()
    let cancel!: () => void
    const promise = new Promise<Snapshot>((resolve, reject) => {
        let settled = false
        const finish = (snapshot: Snapshot | undefined, error?: unknown) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (snapshot) resolve(snapshot)
            else reject(error)
        }
        // 主动结束 Promise，确保底层请求或响应体读取忽略 AbortSignal 时仍能取消。
        cancel = () => {
            finish(undefined, cancellationError())
            controller.abort()
        }
        const timer = setTimeout(() => {
            finish(undefined, new DOMException('EasyK state GET timed out', 'TimeoutError'))
            controller.abort()
        }, GET_TIMEOUT_MS)
        void (async () => {
            try {
                const response = await fetch(STATE_URL, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                    cache: 'no-store',
                    signal: controller.signal,
                })
                if (settled) return
                const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
                if (response.status !== 200 || contentType !== 'application/json') {
                    throw new Error(`Invalid state response: HTTP ${response.status}, ${contentType ?? 'no Content-Type'}`)
                }
                const data: unknown = await response.json()
                if (!settled) finish(snapshotData(data))
            } catch (error) {
                finish(undefined, error)
            }
        })()
    })
    return { promise, cancel }
}

const closeConnection = (owner: Session): void => {
    const connection = owner.connection
    // 先解除连接归属，使关闭过程中或之后到达的旧回调失效。
    owner.connection = undefined
    if (!connection) return
    clearTimeout(connection.timer)
    connection.removeListeners?.()
    connection.source?.close()
    // 待决的同步 GET 随连接失效取消，其结果不能再提交快照或补发钩子。
    clearResyncRequest(connection, connection.resyncRequest)
}

const stopSession = (): void => {
    const previous = session
    // 必须先使会话失效，再释放资源，避免取消请求时的旧回调进入新会话。
    session = undefined
    if (!previous) return
    closeConnection(previous)
    clearTimeout(previous.retryTimer)
    clearTimeout(previous.pollTimer)
    previous.removeVisibilityListener?.()
    const request = previous.request
    previous.request = undefined
    previous.snapshot = undefined
    request?.cancel()
}

const dispose = (): void => {
    stopSession()
    for (const listeners of Object.values(subscriptions)) {
        for (const subscription of listeners) subscription.active = false
        listeners.clear()
    }
}

const isVisible = (): boolean => {
    return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

const listenForVisibility = (owner: Session): void => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
        if (!isCurrent(owner) || owner.mode !== 'get') return
        const connection = owner.connection
        if (!isVisible() && connection?.probe && !connection.opened) {
            // 后台只取消尚未成功的探测，保留一次恢复资格；健康 SSE 不主动关闭。
            closeConnection(owner)
            owner.recoveryCount = SSE_RECOVERY_GET_COUNT
        } else {
            maybeRecover(owner)
        }
    }
    document.addEventListener('visibilitychange', onVisibility)
    owner.removeVisibilityListener = () => document.removeEventListener('visibilitychange', onVisibility)
}

/** 使用当前 Cookie 复位并初始化；全量 GET 成功并安排 SSE 后兑现 Promise。 */
const reload = (): Promise<void> => {
    bindAppLifecycle()
    stopSession()
    const owner: Session = { mode: 'initializing', failures: 0, recoveryCount: 0 }
    session = owner
    const request = requestSnapshot()
    owner.request = request
    return initialize(owner, request)
}

const initialize = async (owner: Session, request: SnapshotRequest): Promise<void> => {
    try {
        const snapshot = await request.promise
        if (!isCurrent(owner)) throw cancellationError()
        owner.request = undefined
        owner.snapshot = snapshot
        // 先提交完整快照，再通知初始事件；回调重入 reload 后立即停止旧初始化。
        dispatch(owner, initialEvents(snapshot))
        if (!isCurrent(owner)) throw cancellationError()
        listenForVisibility(owner)
        owner.mode = 'sse'
        // SSE 建连交给内部调度，初始化 Promise 不等待 open，也不承担建连失败。
        queueMicrotask(() => {
            if (isCurrent(owner)) connect(owner, false)
        })
    } catch (error) {
        if (!isCurrent(owner)) throw cancellationError()
        stopSession()
        throw error
    }
}

const validConnection = (owner: Session, connection: Connection): boolean => {
    return isCurrent(owner) && owner.connection === connection
}

/** 连接关闭时取消在途的同步 GET，其结果不能再提交快照或补发钩子。 */
const clearResyncRequest = (connection: Connection, request?: SnapshotRequest): void => {
    if (!request || connection.resyncRequest !== request) return
    connection.resyncRequest = undefined
    request.cancel()
}

/** 连接或事件异常后按本地快照与 GET 结果比对补发一次钩子；同一断线周期只同步一次。 */
const resync = (owner: Session, connection: Connection): void => {
    // GET 模式下轮询已负责全量同步，恢复探测异常不额外发请求。
    if (connection.resyncing || connection.probe || owner.mode !== 'sse' || !owner.snapshot) return
    connection.resyncing = true
    const request = requestSnapshot()
    connection.resyncRequest = request
    void request.promise.then(snapshot => {
        // 迟到的响应不得覆盖同一连接后续 SSE 帧、降级后的轮询结果或新会话的状态。
        if (!validConnection(owner, connection) || owner.mode !== 'sse' || !owner.snapshot) return
        const events = snapshotEvents(owner.snapshot, snapshot)
        owner.snapshot = snapshot
        dispatch(owner, events)
    }, error => {
        // 同步失败时保留本地快照，允许周期内的下一次异常重试，或由 GET 轮询兜底。
        if (!validConnection(owner, connection)) return
        report('SSE resync GET failed', error)
        clearResyncRequest(connection, request)
        connection.resyncing = false
    }).finally(() => {
        clearResyncRequest(connection, request)
    })
}

const connect = (owner: Session, probe: boolean): void => {
    if (!isCurrent(owner) || owner.connection) return
    if (probe && !isVisible()) {
        owner.recoveryCount = SSE_RECOVERY_GET_COUNT
        return
    }
    const connection: Connection = { probe, opened: false, resyncing: false }
    owner.connection = connection
    try {
        // 原生 EventSource 会忽略 : keep alive 等注释帧，无需增加心跳事件或计时器。
        const source = new EventSource(STATE_URL)
        connection.source = source
        source.onopen = () => {
            if (!validConnection(owner, connection) || connection.opened) return
            connection.opened = true
            clearTimeout(connection.timer)
            owner.failures = 0
            owner.recoveryCount = 0
            owner.mode = 'sse'
            clearTimeout(owner.pollTimer)
            owner.pollTimer = undefined
            const request = owner.request
            // 恢复成功后先解除轮询请求归属，再取消请求，防止迟到 GET 覆盖 SSE 更新。
            owner.request = undefined
            request?.cancel()
            // 重连成功后结束断线周期，下一次异常重新允许一次 GET 同步。
            connection.resyncing = false
        }
        // 服务端不支持 Last-Event-ID 回放，不使用 EventSource 自带的自动重连；
        // 断开后立即关闭并交由本次异常处理，统一走库内的退避重连。
        source.onerror = () => connectionFailed(owner, connection, new Error('SSE connection failed'))
        const listeners = (['push', 'loaded', 'playing'] as const).map(type => {
            const listener = (event: MessageEvent) => receive(owner, connection, type, event.data)
            source.addEventListener(type, listener)
            return () => source.removeEventListener(type, listener)
        })
        connection.removeListeners = () => {
            source.onopen = null
            source.onerror = null
            for (const remove of listeners) remove()
        }
        connection.timer = setTimeout(() => {
            if (!connection.opened) {
                connectionFailed(owner, connection, new DOMException('SSE connection timed out', 'TimeoutError'))
            }
        }, SSE_CONNECT_TIMEOUT_MS)
    } catch (error) {
        connectionFailed(owner, connection, error)
    }
}

const connectionFailed = (owner: Session, connection: Connection, error: unknown): void => {
    if (!validConnection(owner, connection)) return
    // 立即关闭并解除归属，同一连接的超时、错误回调只能累计一次失败。
    closeConnection(owner)
    owner.failures++
    report('SSE attempt failed', error)
    // SSE 异常后先用一次 GET 拉取最新快照覆盖本地，再决定重连或降级。
    resync(owner, connection)
    if (owner.mode === 'get') {
        // 恢复探测失败后重新累计 GET 次数，不进入普通 SSE 快速重试。
        owner.recoveryCount = 0
    } else if (owner.failures >= SSE_MAX_CONSECUTIVE_FAILURES) {
        owner.mode = 'get'
        owner.recoveryCount = 0
        void poll(owner)
    } else {
        owner.retryTimer = setTimeout(() => {
            owner.retryTimer = undefined
            if (isCurrent(owner)) connect(owner, false)
        }, SSE_RETRY_INTERVAL_MS)
    }
}

const receive = (owner: Session, connection: Connection, type: EventName, raw: unknown): void => {
    if (!validConnection(owner, connection) || !connection.opened || !owner.snapshot) return
    try {
        if (typeof raw !== 'string') throw new Error('SSE data must be JSON text')
        const data: unknown = JSON.parse(raw)
        const previous = owner.snapshot
        let next: Snapshot
        let event: StateEvent
        if (type === 'push') {
            if (data !== null && Object.prototype.hasOwnProperty.call(object(data), 'player')) {
                throw new Error('push must not contain player')
            }
            const media = data === null ? null : mediaSource(data)
            next = { media, player: stoppedPlayer() }
            event = pushEvent(media)
        } else {
            // 扁平播放器事件不含媒体 ID；归属和过期事件由服务端保证，前端只校验加载阶段。
            if (!previous.media) throw new Error('SSE player event requires current media')
            const player = object(data)
            if (type === 'loaded') {
                const loaded = playerState(player)
                if (loaded.state === PlayState.Stopped) throw new Error('loaded requires a non-stopped player')
                next = { media: previous.media, player: loaded }
                event = loadedEvent(loaded)
            } else {
                if (previous.player.state === PlayState.Stopped) throw new Error('Player is not loaded')
                const updated = {
                    ...previous.player,
                    state: playState(player.state),
                    current: finiteNumber(player.current, 0, 1),
                    rate: playbackRate(player.rate),
                }
                next = { media: previous.media, player: updated }
                event = playingEvent(updated)
            }
        }
        // 整条事件校验完成后再提交，非法载荷不能造成部分更新。
        owner.snapshot = next
        dispatch(owner, [event])
    } catch (error) {
        report(`Rejected SSE ${type} event`, error)
        // 坏帧被丢弃后本地快照可能落后，用一次 GET 全量纠正。
        resync(owner, connection)
    }
}

const maybeRecover = (owner: Session): void => {
    if (!isCurrent(owner) || owner.mode !== 'get' || owner.connection ||
        owner.recoveryCount < SSE_RECOVERY_GET_COUNT || !isVisible()) return
    // 消费本轮资格；实际建连时再次确认前台状态，避免重复或后台探测。
    owner.recoveryCount = 0
    connect(owner, true)
}

const poll = async (owner: Session): Promise<void> => {
    if (!isCurrent(owner) || owner.mode !== 'get' || owner.request) return
    const request = requestSnapshot()
    owner.request = request
    try {
        const snapshot = await request.promise
        if (!isCurrent(owner) || owner.mode !== 'get' || owner.request !== request) return
        const events = snapshotEvents(owner.snapshot, snapshot)
        owner.snapshot = snapshot
        dispatch(owner, events)
    } catch (error) {
        if (isCurrent(owner) && owner.mode === 'get' && owner.request === request) {
            report('GET poll failed', error)
        }
    } finally {
        // 取消或已失效的请求不计数，也不能为旧会话安排下一轮轮询。
        if (isCurrent(owner) && owner.mode === 'get' && owner.request === request) {
            owner.request = undefined
            // 探测期间继续轮询但暂停计数，防止同一次探测尚未结束又触发下一次。
            if (!owner.connection) {
                owner.recoveryCount = Math.min(owner.recoveryCount + 1, SSE_RECOVERY_GET_COUNT)
            }
            maybeRecover(owner)
            if (isCurrent(owner) && owner.mode === 'get') {
                // 从本次请求完成后开始等待间隔，保证内部 GET 不重叠、不堆积。
                owner.pollTimer = setTimeout(() => {
                    owner.pollTimer = undefined
                    void poll(owner)
                }, GET_POLL_INTERVAL_MS)
            }
        }
    }
}

// 热更新时释放旧模块的连接、请求、定时器和订阅，防止重复同步。
if (import.meta.hot) import.meta.hot.dispose(dispose)
