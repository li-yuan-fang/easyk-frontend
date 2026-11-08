type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

interface LogItem {
  level: LogLevel
  args: string[]      // 序列化后的参数
  message: string     // 拼成一句话，方便后端检索
  ts: number
  url: string
}

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug']

let API_URL = ''
let buffer: LogItem[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let reporting = false // 关键: 上报过程中产生的日志直接丢弃，防止递归

const MAX_BUFFER = 50        // 攒够 50 条就发
const FLUSH_INTERVAL = 5000  // 或每 5 秒发一次
const MAX_ARG_LENGTH = 1000  // 单条参数截断，防止超大对象撑爆请求

const originConsole: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {}

/** 安全序列化: 处理循环引用、Error、DOM、函数、undefined 等 */
function safeSerialize(value: unknown): string {
  const seen = new WeakSet()
  try {
    return JSON.stringify(value, (_, val) => {
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack }
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
        if (val instanceof HTMLElement) return `<${val.tagName.toLowerCase()}>`
      }
      if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`
      if (typeof val === 'bigint') return `${val}n`
      if (typeof val === 'symbol') return val.toString()
      if (val === undefined) return '[undefined]'
      return val
    })
  } catch {
    try { return String(value) } catch { return '[Unserializable]' }
  }
}

function truncate(str: string, max = MAX_ARG_LENGTH) {
  return str.length > max ? str.slice(0, max) + '...' : str
}

function pushLog(level: LogLevel, args: unknown[]) {
  if (reporting) return // 上报请求自身产生的日志不采集

  const serialized = args.map(a =>
    truncate(typeof a === 'string' ? a : safeSerialize(a))
  )
  buffer.push({
    level,
    args: serialized,
    message: truncate(serialized.join(' ')),
    ts: Date.now(),
    url: location.href,
  })

  if (buffer.length >= MAX_BUFFER) flush()
}

function flush(useBeacon = false) {
  if (buffer.length === 0 || !API_URL) return
  const payload = JSON.stringify({ logs: buffer.splice(0) })

  reporting = true
  try {
    if (useBeacon && navigator.sendBeacon) {
      // 页面卸载时用 sendBeacon，保证发得出去
      navigator.sendBeacon(API_URL, new Blob([payload], { type: 'application/json' }))
    } else {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true, // 允许在页面卸载过程中完成请求
      }).catch(() => { /* 静默: 这里绝对不能 console，否则递归 */ })
    }
  } catch {
    // 同样静默
  } finally {
    reporting = false
  }
}

export function initLogger(url: string) {
  API_URL = url

  LEVELS.forEach(level => {
    originConsole[level] = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      originConsole[level]!(...args) // 保留开发者控制台里的原始输出
      pushLog(level, args)
    }
  })

  flushTimer = setInterval(() => flush(), FLUSH_INTERVAL)

  // 页面隐藏 / 卸载时把剩余日志发出去
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}

export function destroyLogger() {
  LEVELS.forEach(level => {
    if (originConsole[level]) {
      console[level] = originConsole[level] as typeof console[typeof level]
    }
  })
  if (flushTimer) clearInterval(flushTimer)
}