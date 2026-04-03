<template>
    <van-pull-refresh
        v-model="manual_loading"
        @refresh="handleBookRefresh"
        success-text="刷新成功"
        class="book-refresh"
        :disabled="drag_rank"
    >
        <div class="book-container" v-if="books && books.list?.length > 0">
            <van-cell-group
                v-for="(item, index) in books.list"
                :key="index"
                style="margin-bottom: 0.5rem;"
                :class="(drag_current == index) ? 'book-drag-shadow' : ''"
                inset

                :draggable="drag_rank"
                @dragenter.prevent="updateRankPos(index)"
                @dragover.prevent
                @dragend.prevent="confirmRank"
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
                            @mousedown="(e) => handleRank(e, index)"
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
import { onMounted, ref } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import type { BookList, BookListItem } from '../common/book_interfaces';
import { queryBookList, removeBook, rankBook } from '../common/easyk_api';

//已点列表
const books = ref<BookList>({ list: [] })

//手动刷新中
const manual_loading = ref<boolean>(false)

//拖拽排序
const drag_rank = ref<boolean>(false)
const drag_start = ref<number>(-1)
const drag_current = ref<number>(-1)

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
    })
}

//开始拖拽
const handleRank = (e : MouseEvent, index : number) => {
    drag_rank.value = true
    drag_current.value = index
    drag_start.value = index

    //先触发mouseup 避免影响上拉刷新组件
    document.dispatchEvent(new MouseEvent('mouseup', e))
}

//拖拽更新选中歌曲位置
const updateRankPos = (index : number) => {
    if (drag_current.value < 0 || index == drag_current.value) return

    let item : BookListItem = <BookListItem> (<any> books.value.list.splice(drag_current.value, 1)[0])
    books.value.list = [...books.value.list.slice(0, index), item, ...books.value.list.slice(index)]

    drag_current.value = index

    console.log(index)
}

//提交排序更新
const confirmRank = () => {
    //提交更新
    if (drag_current.value != drag_start.value)
        handleBookRank(drag_current.value, true)

    drag_rank.value = false
    drag_current.value = -1
    drag_start.value = -1
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
    reload()
})

</script>

<style>

.book-refresh .van-pull-refresh__track {
    flex: 1;
}

.book-refresh {
    flex: 1;
    overflow-y: auto;
}

.book-container {
    flex: 1;
    background: transparent;
    margin: 0;
    padding: 1rem 0;
    overflow-y: auto;
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

</style>
