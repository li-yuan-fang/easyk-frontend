<template>
    <van-pull-refresh
        v-model="manual_loading"
        @refresh="handleBookRefresh"
        success-text="刷新成功"
        class="book-refresh"
    >
        <div class="book-container" v-if="books && books.list?.length > 0">
            <van-cell-group
                v-for="(item, index) in books.list"
                :key="index"
                style="margin-bottom: 0.5rem;"
                inset
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
                            @click="handleBookTop(index)"
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
import type { BookList } from '../common/book_interfaces';
import { queryBookList, removeBook, topBook } from '../common/easyk_api';

const books = ref<BookList>({ list: [] })

const manual_loading = ref<boolean>(false)

const emit = defineEmits(['loading'])

const handleBookRefresh = () => {
    queryBookList().then((list) => books.value = list)
    .finally(() => manual_loading.value = false)
}

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

const handleBookTop = (index : number) => {
    let id = books.value.list[index]?.id
    if (!id) return

    emit('loading', true)
    topBook(id).then(() => {
        showToast({
            icon: 'passed',
            type: 'success',
            zIndex: '3002',
            message: '顶歌成功',
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
            message: `顶歌失败\n${reason}`,
            closeOnClick: true,
            closeOnClickOverlay: true
        })
    })
}

const reload = () => {
    emit('loading', true)
    queryBookList().then((list) => {
        books.value = list
    })
    .catch(() => showToast({
        icon: 'close',
        type: 'fail',
        message: '加载已点列表失败',
        closeOnClick: true,
        closeOnClickOverlay: true
    }))
    .finally(() => emit('loading', false))
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

</style>
