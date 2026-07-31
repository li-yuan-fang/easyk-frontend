<template>
    <van-pull-refresh
        ref="scroll_container"
        v-model="manual_loading"
        @refresh="handleBookRefresh"
        success-text="刷新成功"
        class="book-refresh"
        :disabled="drag_rank"
        @click="confirmRank"
        :style="{
            'overflow-y': drag_rank ? 'hidden' : 'auto',
            'touch-action': drag_rank ? 'none' : 'pan-y'
        }"
    >
        <div v-if="books && books.list?.length > 0" class="book-container" >
            <van-cell-group
                v-for="(item, index) in books.list"
                :key="index"
                style="margin-bottom: 0.5rem;"
                :class="(drag_rank && drag_current == index) ? 'book-drag-shadow book-list-item' : 'book-list-item'"
                inset

                :draggable="drag_rank"
                @dragenter.prevent="updateRankPos(index)"
                @dragover.prevent
                @dragend.prevent="confirmRank"
                @touchend="confirmRank"
            >
                <van-cell
                    :title="item.title"
                    :label="item.order"
                    center
                >
                    <template #value>
                        <van-icon
                            class="book-list-item-tool"
                            name="back-top"
                            size="1.8rem"
                            @click="handleBookRank(index)"
                        />
                        <van-icon
                            class="book-list-item-tool"
                            name="ascending"
                            size="1.6rem"
                            @mousedown="(e : MouseEvent) => handleRank(e, index)"
                            @touchstart.prevent="(e : TouchEvent) => handleRank(e, index)"
                            :color="(drag_rank && drag_current == index) ? 'var(--van-button-primary-background)' : 'inherit'"
                        />
                        <van-icon
                            class="book-list-item-tool"
                            name="close"
                            size="1.8rem"
                            color="#F56C6C"
                            @click="handleBookRemove(index)"
                        />
                    </template>
                </van-cell>
            </van-cell-group>
        </div>
        <div class="book-list-empty" v-else>
            <h1 class="book-list-empty-text">暂无已点歌曲</h1>
        </div>
        <van-back-top class="book-back-top" />
    </van-pull-refresh>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import type { BookList, BookListItem } from '../common/book_interfaces';
import { queryBookList, removeBook, rankBook } from '../common/easyk_api';

//已点列表
const books = ref<BookList>({ list: [] })
const scroll_container = ref<any>()

//手动刷新中
const manual_loading = ref<boolean>(false)

//拖拽排序
const drag_rank = ref<boolean>(false)
const drag_current = ref<number>(-1)
let drag_start : number = -1
let drag_event : MouseEvent | undefined = undefined
let drag_confirming : boolean = false
let auto_scroll_frame : number | undefined = undefined
let auto_scroll_speed : number = 0
let auto_scroll_pointer_y : number = -1

const auto_scroll_edge : number = 80
const auto_scroll_max_speed : number = 18

const emit = defineEmits(['loading'])

//下拉刷新
const handleBookRefresh = () => {
    manual_loading.value = true
    queryBookList().then((list) => books.value = list)
    .finally(() => manual_loading.value = false)
}

//移除
const handleBookRemove = (index : number) => {
    showConfirmDialog({
        title: '移除确认',
        message: `确定要移除 ${books.value?.list[index]?.title} 吗？\n(点歌:${books.value?.list[index]?.order})`,
        confirmButtonColor: '#F56C6C'
    })
    .then(() => {
        let id = books.value.list[index]?.id
        if (!id) return
        
        emit('loading', true)
        removeBook(id).then(() => {
            showToast({
                icon: 'passed',
                type: 'success',
                zIndex: '3002',
                message: '移除成功',
                closeOnClick: true,
                closeOnClickOverlay: true
            })
            reload()
        }).catch((reason) => {
            emit('loading', false)
            showToast({
                icon: 'close',
                type: 'fail',
                zIndex: '3002',
                message: `移除失败\n${reason}`,
                closeOnClick: true,
                closeOnClickOverlay: true
            })
        })
    })
}

//顶歌
const handleBookRank = (index : number, rank : boolean = false) => {
    let id = books.value.list[index]?.id
    if (!id) return

    emit('loading', true)
    rankBook(id, rank ? index : 0).then(() => {
        if (!rank) {
            showToast({
                icon: 'passed',
                type: 'success',
                zIndex: '3002',
                message: '顶歌成功',
                closeOnClick: true,
                closeOnClickOverlay: true
            })
        }
        
        reload()
    }).catch((reason) => {
        emit('loading', false)
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: `${rank ? '排序' : '顶歌'}失败\n${reason}`,
            closeOnClick: true,
            closeOnClickOverlay: true
        })

        reload(false)
    })
}

//开始拖拽
const handleRank = (e : MouseEvent | TouchEvent | undefined, index : number) => {
    if (e && 'touches' in e && e.cancelable) e.preventDefault()

    drag_rank.value = true
    drag_confirming = false
    drag_current.value = index
    drag_start = index

    //先触发结束事件 避免影响上拉刷新组件
    if (e && e.type == 'mousedown' && 'button' in e) drag_event = e

    const pointer_y = e ? getPointerY(e) : undefined
    if (pointer_y != undefined) handleDragMove(pointer_y)
}

//拖拽更新选中歌曲位置
const updateRankPos = (index : number) => {
    if (drag_current.value < 0 || index == drag_current.value) return

    let item : BookListItem = <BookListItem> (<any> books.value.list.splice(drag_current.value, 1)[0])
    books.value.list = [...books.value.list.slice(0, index), item, ...books.value.list.slice(index)]

    drag_current.value = index
}

const getScrollContainer = () : HTMLElement | undefined => {
    const target = scroll_container.value?.$el || scroll_container.value
    return target instanceof HTMLElement ? target : undefined
}

const getPointerY = (e : MouseEvent | TouchEvent) : number | undefined => {
    if ('touches' in e) {
        return e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY
    }

    return e.clientY
}

const getAutoScrollSpeed = (targetY : number) : number => {
    const container = getScrollContainer()
    if (!container) return 0

    const bound = container.getBoundingClientRect()
    if (targetY < bound.top + auto_scroll_edge) {
        if (container.scrollTop <= 0) return 0

        const rate = Math.min(1, (bound.top + auto_scroll_edge - targetY) / auto_scroll_edge)
        return -Math.ceil(auto_scroll_max_speed * rate)
    }

    if (targetY > bound.bottom - auto_scroll_edge) {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight) return 0

        const rate = Math.min(1, (targetY - (bound.bottom - auto_scroll_edge)) / auto_scroll_edge)
        return Math.ceil(auto_scroll_max_speed * rate)
    }

    return 0
}

const updateRankPosByPointer = (targetY : number) => {
    const elements = document.getElementsByClassName('book-list-item')
    let nearest_index = -1
    let nearest_distance = Number.MAX_SAFE_INTEGER

    for (let i = 0; i < elements.length; i++) {
        const bound = (<HTMLElement> (<any> elements[i])).getBoundingClientRect()
        const center = bound.top + bound.height / 2
        const distance = Math.abs(targetY - center)

        if (distance < nearest_distance) {
            nearest_index = i
            nearest_distance = distance
        }

        if (targetY >= bound.top && targetY <= bound.top + bound.height) {
            updateRankPos(i)
            return
        }
    }

    const container = getScrollContainer()
    if (!container || nearest_index < 0) return

    const bound = container.getBoundingClientRect()
    if (targetY >= bound.top && targetY <= bound.bottom) updateRankPos(nearest_index)
}

const stopAutoScroll = () => {
    auto_scroll_speed = 0

    if (auto_scroll_frame != undefined) {
        cancelAnimationFrame(auto_scroll_frame)
        auto_scroll_frame = undefined
    }
}

const runAutoScroll = () => {
    const container = getScrollContainer()
    if (!drag_rank.value || !container || auto_scroll_speed == 0) {
        auto_scroll_frame = undefined
        return
    }

    const last_top = container.scrollTop
    container.scrollTop += auto_scroll_speed
    if (container.scrollTop != last_top) updateRankPosByPointer(auto_scroll_pointer_y)

    auto_scroll_speed = getAutoScrollSpeed(auto_scroll_pointer_y)
    if (auto_scroll_speed == 0) {
        auto_scroll_frame = undefined
        return
    }

    auto_scroll_frame = requestAnimationFrame(runAutoScroll)
}

const updateAutoScroll = (targetY : number) => {
    auto_scroll_pointer_y = targetY
    auto_scroll_speed = getAutoScrollSpeed(targetY)

    if (auto_scroll_speed == 0) {
        stopAutoScroll()
        return
    }

    if (auto_scroll_frame == undefined) {
        auto_scroll_frame = requestAnimationFrame(runAutoScroll)
    }
}

const handleDragMove = (targetY : number) => {
    if (!drag_rank.value) return

    updateRankPosByPointer(targetY)
    updateAutoScroll(targetY)
}

const handleDragOver = (e : DragEvent) => {
    if (!drag_rank.value) return

    e.preventDefault()
    handleDragMove(e.clientY)
}

const handleDrop = (e : DragEvent) => {
    if (!drag_rank.value) return

    e.preventDefault()
    confirmRank()
}

//检测touchmove适配移动端
const handleTouchMove = (e : TouchEvent) => {
    if (!drag_rank.value || !e.changedTouches || e.changedTouches.length == 0) return

    e.preventDefault() // 阻止默认滚动行为

    const targetY = getPointerY(e)
    if (targetY == undefined) return

    handleDragMove(targetY)
}

//提交排序更新
const confirmRank = () => {
    if (!drag_rank.value || drag_confirming) return

    drag_confirming = true

    stopAutoScroll()

    //提交更新
    if (drag_rank.value && drag_current.value >= 0 && drag_current.value != drag_start)
        handleBookRank(drag_current.value, true)

    drag_current.value = -1
    drag_start = -1

    if (drag_event) {
        document.dispatchEvent(new MouseEvent('mouseup', drag_event))
        drag_event = undefined
    }

    nextTick(() => {
        drag_rank.value = false
        drag_confirming = false
    })
}

//重新加载列表
const reload = (slient : boolean = false) => {
    if (manual_loading.value) return

    if (!slient) emit('loading', true)
    queryBookList().then((list) => {
        books.value = list
    })
    .catch(() => {
        if (!slient) {
            showToast({
                icon: 'close',
                type: 'fail',
                message: '加载已点列表失败',
                closeOnClick: true,
                closeOnClickOverlay: true
            })
        }
    })
    .finally(() => {
        if (!slient) emit('loading', false)
    })
}

defineExpose({ reload })

onMounted(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', confirmRank)
    document.addEventListener('touchcancel', confirmRank)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragend', confirmRank)
    document.addEventListener('drop', handleDrop)
    reload()
})

onUnmounted(() => {
    stopAutoScroll()
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', confirmRank)
    document.removeEventListener('touchcancel', confirmRank)
    document.removeEventListener('dragover', handleDragOver)
    document.removeEventListener('dragend', confirmRank)
    document.removeEventListener('drop', handleDrop)
})

</script>

<style>

.book-refresh .van-pull-refresh__track {
    flex: 1;
}

.book-refresh {
    flex: 1;
}

.book-container {
    flex: 1;
    background: transparent;
    margin: 0;
    padding: 1rem 0;
}

.book-list-item-tool {
    cursor: pointer;
    margin-left: 0.8rem;
}

.book-list-empty {
    display: flex;
    color: #808080;
    align-items: center;
    justify-content: center;
    flex: 1;
}

.book-list-empty-text {
    font-size: 1.2rem;
}

.book-back-top {
    --van-back-top-size: var(--van-floating-bubble-size);
}

.book-drag-shadow {
    border: 0.15rem solid var(--van-button-primary-background);
}

[draggable="true"] {
  -webkit-user-drag: element;
  -webkit-user-select: none;
  user-select: none;
}

</style>
