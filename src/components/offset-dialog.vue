<template>
    <van-dialog
        title="歌词偏移"
        v-model:show="shown"
        show-cancel-button
        @cancel="handleCancel"
        @confirm="handleConfirm"
    >
        <div class="offset-line offset-row" style="display: flex;">
            <van-field
                v-if="offset_edit"
                class="offset-input"
                v-model="offset"
                type="number"
                placeholder="请输入歌词偏移"
                @change="offset = Math.max(-range, Math.min(offset, range))"
            >
                <template #button>
                    <van-button size="small" type="primary" @click="handleField">确定</van-button>
                </template>
            </van-field>
            <text
                v-else
                class="offset-text"
                style="cursor: pointer;"
                @click="offset_edit = true"
            >
                {{ getText() }}
            </text>
        </div>
        <van-slider
            class="offset-slider offset-line"
            v-model="offset"
            step="0.1"
            :min="-range"
            :max="range"
            active-color="var(--van-slider-inactive-background)"
            @drag-start="offset_edit = false"
            @change="handlePreview"
        />
        <div class="offset-row offset-line">
            <van-switch
                v-model="preview"
                @click="handlePreview"
                style="margin-right: 0.5rem;"
            />
            <text class="offset-text">预览</text>
        </div>
    </van-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { showToast } from 'vant';
import { PanelAction, updatePanel } from '../common/easyk_api';

//调节范围
const range = 1000

const props = defineProps(['value'])
const emit = defineEmits(['refresh'])

const shown = ref<boolean>(false)
const offset = ref<number>(0)
const preview = ref<boolean>(true)

const offset_edit = ref<boolean>(false)

//获取字符
const getText = () : string => {
    if (offset.value > 0) {
        return `提前 ${Math.abs(offset.value)} ms`
    } else if (offset.value < 0) {
        return `延迟 ${Math.abs(offset.value)} ms`
    } else {
        return '无偏移'
    }
}

//显示
const show = () => {
    offset.value = props.value
    shown.value = true
}

//提交更改
const commit = (value : number) => {
    return updatePanel(PanelAction.Offset, value)
}

const handleField = () => {
    offset_edit.value = false
}

//处理预览
const handlePreview = () => {
    offset_edit.value = false

    if (preview.value) commit(offset.value)
}

//取消更改
const handleCancel = () => {
    if (offset.value != props.value) commit(props.value)
    offset_edit.value = false
    shown.value = false
}

//确认保存
const handleConfirm = () => {
    offset_edit.value = false
    commit(offset.value).then((resp) => {
        shown.value = false
        emit('refresh', resp)
    }).catch(() => {
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: '偏移修改失败',
            closeOnClick: true,
            closeOnClickOverlay: true
        })
    })
}

defineExpose({ show })

</script>

<style>

.offset-line {
    margin: 1rem 0;
}

.offset-row {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
}

.offset-text {
    font-size: 1em;
}

.offset-slider {
    width: 80%;
}

.offset-input {
    border: 0.08rem solid #e4e4e4;
    border-radius: 0.4rem;
}

</style>
