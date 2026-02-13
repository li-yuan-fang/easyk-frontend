<template>
    <div class="book-dialog-container">
        <van-dialog
            :show="modelValue"
            title="点歌"
            show-cancel-button
            confirm-button-text="点歌"
            @update:show="(e) => emit('update:modelValue', e)"
            @confirm="handleBook"
            @cancel="resetDialog"
        >
            <van-field
                class="book-dialog-field"
                v-model="title"
                label="歌名"
                placeholder="请输入歌名"
            />
            <van-field
                class="book-dialog-field"
                :model-value="getTypeText()"
                is-link
                readonly
                label="点歌方式"
                placeholder="请选择点歌方式"
                @click="type_shown = true"
            />
            <van-field
                class="book-dialog-field"
                v-if="video_type == 1"
                v-model="BV_code"
                center
                clearable
                label="BV号"
                placeholder="请输入BV号"
            >
                <template #button>
                    <van-button
                        size="small"
                        type="primary"
                        @click="handlePasteBV"
                    >
                        粘贴
                    </van-button>
                </template>
            </van-field>
            <van-uploader
                class="book-dialog-upload"
                v-if="video_type == 0"
                v-model="upload_files"
                accept="video/*"
                multiple
                max-count="1"
                :after-read="handleVideoRead"
            >
                <template #preview-cover="{ file }">
                    <div
                        class="preview-snapshot"
                        :style="preview_snapshot.length > 0 ? `background-image: url('${preview_snapshot}');` : ''"
                    />
                    <div class="preview-cover van-ellipsis">{{ file.name }}</div>
                </template>
            </van-uploader>
        </van-dialog>
        <van-popup v-model:show="type_shown" round position="bottom">
            <van-cascader
                v-model="video_type_cascader"
                title="请选择点歌方式"
                :options="video_types"
                @close="type_shown = false"
                @finish="onSelected"
            />
        </van-popup>
        <van-overlay style="z-index: 3001;" :show="uploading">
            <div class="loading-wrapper">
                <div class="loading-block">
                    <van-circle
                        class="uploading-circle"
                        v-model:current-rate="uploading_current"
                        :rate="uploading_expert"
                        :stroke-width="60"
                        :color="gradientColor"
                        :text="uploading_expert.toFixed(0).padStart(2, '0')"
                    />
                    <text class="loading-text">视频上传中</text>
                </div>
            </div>
        </van-overlay>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { renderPreview } from '../common/video_preview';
import { book } from '../common/easyk_api';
import { uploadVideo } from '../common/uploader';

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'loading', 'refresh'])

const video_type = ref<number>(0)
const video_type_cascader = ref<number>(0)
const type_shown = ref<boolean>(false)

const uploading = ref<boolean>(false)
const uploading_current = ref<number>(0)
const uploading_expert = ref<number>(0)

const preview_snapshot = ref<string>('')

const gradientColor = {
    '0%': '#3fecff',
    '100%': '#6149f6',
}

const video_types = [
    {
        text: '上传视频',
        value: 0
    },
    {
        text: 'bilibili',
        value: 1
    },
    {
        text: '投屏',
        value: 2
    }
]

const title = ref<string>('')

const BV_code = ref<string>('')

/**
 * 
    objectUrl   Blob Url
    content     内容(Base64)
 */
const upload_files = ref([])

const getTypeText = () => {
    for (let i = 0; i < video_types.length; i++) {
        if (video_type.value === video_types[i]?.value) return video_types[i]?.text || ''
    }
    return ''
}

const onSelected = (e : any) => {
    type_shown.value = false
    video_type.value = e['selectedOptions'][0].value
}

const handlePasteBV = async () => {
    try {
        const text = await navigator.clipboard.readText()
        BV_code.value = text
    } catch {
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: '获取剪贴板失败',
            closeOnClick: true
        })
    }
}

const handleVideoRead = (uploaded : any) => {
    renderPreview(uploaded['objectUrl']).then((picture) => preview_snapshot.value = picture)
}

const resetDialog = () => {
    title.value = ''
    video_type.value = 0
    video_type_cascader.value = 0
    preview_snapshot.value = ''
    BV_code.value = ''
    upload_files.value = []
}

const handleBook = () => {
    if (title.value.length == 0) {
        showToast({
            icon: 'close',
            type: 'fail',
            zIndex: '3002',
            message: '歌名不能为空',
            closeOnClick: true
        })
        
        return
    }

    emit('loading', true)

    const commitBook = (content : string) => {
        book(title.value, video_type.value, content)
        .then(() => {

            nextTick(() => {
                showToast({
                    icon: 'passed',
                    type: 'success',
                    zIndex: '3002',
                    message: '点歌成功',
                    closeOnClick: true
                })

                emit('refresh')
            })
        }).catch(() => {
            showToast({
                icon: 'close',
                type: 'fail',
                zIndex: '3002',
                message: '点歌失败',
                closeOnClick: true
            })
        }).finally(() => {
            resetDialog()
            emit('loading', false)
        })
    }

    switch (video_type.value) {
        case 0:
            {
                if (upload_files.value.length == 0) {
                    showToast({
                        icon: 'close',
                        type: 'fail',
                        zIndex: '3002',
                        message: '请选择要上传的文件',
                        closeOnClick: true
                    })

                    emit('loading', false)
                    return
                }

                let file : any = upload_files.value[0]

                uploading.value = true
                uploading_current.value = 0
                uploading_expert.value = 0
                emit('loading', false)

                uploadVideo(file['content'], (p) => uploading_expert.value = Math.max(p * 100, uploading_expert.value))
                .then((id) => {
                    console.log(`上传成功 - ${id}`)

                    nextTick(() => {
                        emit('loading', true)
                        commitBook(id)
                    })
                }).catch((reason) => {
                    showToast({
                        icon: 'close',
                        type: 'fail',
                        zIndex: '3002',
                        message: reason,
                        closeOnClick: true
                    })
                    console.log(reason)

                    resetDialog()
                }).finally(() => uploading.value = false)
            }

            break
        case 1:
            commitBook(BV_code.value)
            break
        case 2:
            commitBook('')
            break
        default:
            resetDialog()
            emit('loading', false)
    }
}

onMounted(() => {
    resetDialog()
})

</script>

<style>

.book-dialog-container {
    display: flex;
}

.book-dialog-field {
    margin: 0.5rem 0.2rem;
}

.van-dialog__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.preview-cover {
    position: absolute;
    bottom: 0;
    box-sizing: border-box;
    width: 100%;
    padding: 4px;
    color: #fff;
    font-size: 12px;
    text-align: center;
    background: rgba(0, 0, 0, 0.3);
}

.preview-snapshot {
    width: 100%;
    height: 100%;
    background-color: #fff;
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
}

.uploading-circle > div {
    font-size: 2.5rem;
    color: #303030;
}

.loading-text {
    color: #505050;
}

</style>
