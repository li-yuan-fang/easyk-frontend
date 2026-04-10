<template>
    <van-dialog
        :title="getTitle()"
        v-model:show="shown"
        show-cancel-button
        @cancel="handleCancel"
        @confirm="handleConfirm"
    >
        <div class="offset-line offset-row" style="display: flex;">
            <van-field
                v-if="offset_edit"
                class="offset-input"
                v-model="value"
                type="number"
                :placeholder="`请输入${getTitle()}`"
                @change="offset = Math.max(slide_min, Math.min(ValueToOffset(value), slide_max))"
            >
                <template #button>
                    <van-button size="small" type="primary" @click="handleField">确定</van-button>
                </template>
            </van-field>
            <text
                v-else
                class="offset-text"
                style="cursor: pointer;"
                @click="handleOpenField"
            >
                {{ getText() }}
            </text>
        </div>
        <van-slider
            class="offset-slider offset-line"
            v-model="offset"
            :step="slide_step"
            :min="slide_min"
            :max="slide_max"
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
const slide_min = ref<number>(-1000)
const slide_max = ref<number>(1000)
const slide_step = ref<number>(0.1)

const props = defineProps(['value'])
const emit = defineEmits(['refresh'])

const mode = ref<PanelAction>(PanelAction.Offset)

const shown = ref<boolean>(false)
const value = ref<number>(0)
const offset = ref<number>(0)
const preview = ref<boolean>(true)

const offset_edit = ref<boolean>(false)

//获取标题
const getTitle = () : string => {
    switch (mode.value) {
        case PanelAction.Offset:
            return '歌词偏移'
        case PanelAction.Contrast:
            return '歌词对比度'
        default:
            return '未知参数'
    }
}

//获取内容
const getText = () : string => {
    switch (mode.value) {
        case PanelAction.Offset:
            {
                if (offset.value > 0) {
                    return `提前 ${Math.abs(offset.value)} ms`
                } else if (offset.value < 0) {
                    return `延迟 ${Math.abs(offset.value)} ms`
                } else {
                    return '无偏移'
                }
            }
        case PanelAction.Contrast:
            return `${offset.value}%`
        default:
            return ''
    }
}

//换算
const OffsetToValue = (o : number) : number => {
    switch (mode.value) {
        case PanelAction.Contrast:
            return o / 100
        default:
            return o
    }
}

const ValueToOffset = (v : number) : number => {
    switch (mode.value) {
        case PanelAction.Contrast:
            return v * 100
        default:
            return v
    }
}

const updateRange = () => {
    switch (mode.value) {
        case PanelAction.Offset:
            slide_min.value = -1000
            slide_max.value = 1000
            slide_step.value = 0.1
            break
        case PanelAction.Contrast:
            slide_min.value = 0
            slide_max.value = 50
            slide_step.value = 0.5
            break
    }
}

//显示
const show = (m : PanelAction) => {
    mode.value = m
    updateRange()

    offset.value = ValueToOffset(props.value)
    shown.value = true
}

//提交更改
const commit = (value : number) => {
    return updatePanel(mode.value, value)
}

const handleOpenField = () => {
    value.value = OffsetToValue(offset.value)
    offset_edit.value = true
}

const handleField = () => {
    offset_edit.value = false
}

//处理预览
const handlePreview = () => {
    offset_edit.value = false

    if (preview.value) commit(OffsetToValue(offset.value))
}

//取消更改
const handleCancel = () => {
    if (OffsetToValue(offset.value) != props.value) commit(props.value)
    offset_edit.value = false
    shown.value = false
}

//确认保存
const handleConfirm = () => {
    offset_edit.value = false
    commit(OffsetToValue(offset.value)).then((resp) => {
        shown.value = false
        emit('refresh', resp)
    }).catch(() => {
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: `${getTitle()}修改失败`,
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
