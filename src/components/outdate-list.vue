<template>
    <van-pull-refresh
        v-model="manual_loading"
        @refresh="handleOutdateRefresh"
        success-text="刷新成功"
        class="outdate-refresh"
    >
        <div class="outdate-container" v-if="outdates && outdates.list?.length > 0">
            <van-cell-group
                v-for="(item, index) in outdates.list"
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
                            class="outdate-list-item-tool"
                            name="replay"
                            size="1.8rem"
                            @click="handleoutdateReorder(index)"
                        />
                    </template>
                </van-cell>
            </van-cell-group>
        </div>
        <div class="outdate-list-empty" v-else>
            <h1 class="outdate-list-empty-text">暂无已唱歌曲</h1>
        </div>
        <van-back-top class="outdate-back-top" />
    </van-pull-refresh>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { showToast } from 'vant';
import type { BookList } from '../common/book_interfaces';
import { queryOutdatedList, reorderBook } from '../common/easyk_api';

const outdates = ref<BookList>({ list: [] })

const manual_loading = ref<boolean>(false)

const emit = defineEmits(['loading'])

const handleOutdateRefresh = () => {
    queryOutdatedList().then((list) => outdates.value = list)
    .finally(() => manual_loading.value = false)
}

const handleoutdateReorder = (index : number) => {
    let id = outdates.value.list[index]?.id
    if (!id) return

    emit('loading', true)
    reorderBook(id).then(() => {
        showToast({
            icon: 'passed',
            type: 'success',
            zIndex: '3002',
            message: '点歌成功',
            closeOnClick: true
        })
        reload()
    }).catch(() => {
        emit('loading', false)
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: '点歌失败',
            closeOnClick: true
        })
    })
}

const reload = () => {
    emit('loading', true)
    queryOutdatedList().then((list) => {
        outdates.value = list
    })
    .catch(() => showToast({
        icon: 'close',
        type: 'fail',
        zIndex: '3002',
        message: '加载已点列表失败',
        closeOnClick: true
    }))
    .finally(() => emit('loading', false))
}


defineExpose({ reload })

onMounted(() => {
    reload()
})

</script>

<style>

.outdate-refresh .van-pull-refresh__track {
    flex: 1;
}

.outdate-refresh {
    flex: 1;
    overflow-y: auto;
}

.outdate-container {
    flex: 1;
    background: transparent;
    margin: 0;
    padding: 1rem 0;
    overflow-y: auto;
}

.outdate-list-item-tool {
    cursor: pointer;
    margin-left: 0.8rem;
}

.outdate-list-empty {
    display: flex;
    color: #808080;
    align-items: center;
    justify-content: center;
    flex: 1;
}

.outdate-list-empty-text {
    font-size: 1.2rem;
}

.outdate-back-top {
    --van-back-top-size: var(--van-floating-bubble-size);
}

</style>
