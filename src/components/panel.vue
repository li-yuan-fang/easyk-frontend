import { ref } from "vue"

<template>
    <van-popup
        v-model:show="panel_shown"
        closeable
        round
        position="bottom"
        class="panel-dialog"
    >
        <div class="panel-buttons-group">
            <van-button
                type="primary"
                icon="pause-circle-o"
                class="panel-button"
                @click="handlePause"
                :loading="loading_action"
            >
                暂停
            </van-button>
            <van-button
                type="primary"
                icon="play-circle-o"
                class="panel-button"
                @click="handlePush"
                :loading="loading_action"
            >
                切歌
            </van-button>
        </div>
        <div class="panel-volume-group panel-buttons-group">
            <div class="panel-volume-content">
                <van-icon name="volume-o" />
                <van-slider
                    class="panel-volume"
                    v-model="panel_volume"
                    bar-height="0.25rem"
                    inactive-color="#d0d0d0"
                    @update:model-value="handleVolume"
                    @change="handleVolumeComplete"
                />
                <text>{{ panel_volume }}</text>
            </div>
        </div>
        <van-cell-group
            v-if="panel_accompaniment_valid"
            class="panel-nickname-box"
            inset
        >
            <van-cell center title="实时伴奏">
                <template #right-icon>
                    <van-switch
                        v-model="panel_accompaniment"
                        :loading="panel_loading"
                        @click="handlePanel(PanelAction.Accompaniment, panel_accompaniment)"
                    />
                </template>
            </van-cell>
        </van-cell-group>
        <van-cell-group class="panel-nickname-box" inset>
            <van-cell
                title="歌词选项"
                center
                is-link
                :arrow-direction="panel_lyrics_shown ? 'down' : 'left'"
                @click="panel_lyrics_shown = !panel_lyrics_shown"
            />
            <van-cell v-if="panel_lyrics_shown" title="显示假名" center>
                <template #right-icon>
                    <van-switch
                        v-model="panel_kana"
                        :loading="panel_loading"
                        @click="handlePanel(PanelAction.Kana, panel_kana)"
                    />
                </template>
            </van-cell>
            <van-cell v-if="panel_lyrics_shown" title="显示翻译" center>
                <template #right-icon>
                    <van-switch
                        v-model="panel_translated"
                        :loading="panel_loading"
                        @click="handlePanel(PanelAction.Translated, panel_translated)"
                    />
                </template>
            </van-cell>
            <van-cell v-if="panel_lyrics_shown" title="显示罗马音" center>
                <template #right-icon>
                    <van-switch
                        v-model="panel_roma"
                        :loading="panel_loading"
                        @click="handlePanel(PanelAction.Roma, panel_roma)"
                    />
                </template>
            </van-cell>
            <van-cell
                title="歌词偏移"
                is-link
                @click="offset.show()"
            />
        </van-cell-group>
        <van-cell-group class="panel-nickname-box" style="margin-bottom: 1rem;" inset>
            <van-cell v-if="panel_qrcode_valid" center title="显示二维码">
                <template #right-icon>
                    <van-switch
                        v-model="panel_qrcode"
                        :loading="panel_loading"
                        @click="handlePanel(PanelAction.QRCode, panel_qrcode)"
                    />
                </template>
            </van-cell>
            <van-cell
                title="用户凭据"
                is-link
                @click="emit('pass')"
            />
        </van-cell-group>
    </van-popup>

    <offset-dialog
        ref="offset"
        :value="panel_offset"
        @refresh="refreshPanel"
    />
</template>

<script setup lang="ts">
import OffsetDialog from './offset-dialog.vue';
import { showToast } from 'vant'
import { ref } from 'vue'
import { getPanel, PanelAction, pause, push, setVolume, updatePanel } from '../common/easyk_api'

//偏移对话框
const offset = ref()

//控制面板
const panel_shown = ref<boolean>(false)

//按键加载
const loading_action = ref<boolean>(false)

//面板
const panel_volume = ref<number>(0)

const panel_accompaniment_valid = ref<boolean>(false)
const panel_accompaniment = ref<boolean>(false)

const panel_lyrics_shown = ref<boolean>(false)

const panel_kana = ref<boolean>(false)
const panel_translated = ref<boolean>(false)
const panel_roma = ref<boolean>(false)
const panel_offset = ref<number>(0)

const panel_qrcode_valid = ref<boolean>(false)
const panel_qrcode = ref<boolean>(false)

const panel_loading = ref<boolean>(false)
const volume_uploading = ref<boolean>(false)

//面板按键 - 暂停
const handlePause = () => {
    loading_action.value = true
    pause().then(() => {}).catch(() => {
        showToast({
        icon: 'close',
        type: 'fail',
        zIndex: '3002',
        message: '暂停失败',
        closeOnClick: true
        })
    }).finally(() => loading_action.value = false)
}

//面板按键 - 切歌
const handlePush = () => {
    loading_action.value = true
    push().then(() => {
        showToast({
        icon: 'passed',
        type: 'success',
        zIndex: '3002',
        message: '切歌成功',
        closeOnClick: true
        })
    }).catch(() => {
        showToast({
        icon: 'close',
        type: 'fail',
        zIndex: '3002',
        message: '切歌失败',
        closeOnClick: true
        })
    }).finally(() => loading_action.value = false)
}

//更新面板显示状态
const refreshPanel = (panel : any) => {
    panel_volume.value = Math.round((panel[PanelAction.Volume] ?? 0) * 100)

    panel_accompaniment_valid.value = panel[PanelAction.Accompaniment] != undefined
    if (panel_accompaniment_valid.value) panel_accompaniment.value = panel[PanelAction.Accompaniment] ?? false

    panel_kana.value = panel[PanelAction.Kana] ?? false
    panel_translated.value = panel[PanelAction.Translated] ?? false
    panel_roma.value = panel[PanelAction.Roma] ?? false

    panel_offset.value = panel[PanelAction.Offset] ?? 0

    panel_qrcode_valid.value = panel[PanelAction.QRCode] != undefined
    if (panel_qrcode_valid.value) panel_qrcode.value = panel[PanelAction.QRCode] ?? false
}

//提交面板操作
const handlePanel = (id : PanelAction, value : any) => {
    panel_loading.value = true
    updatePanel(id, value).then(refreshPanel)
    .catch((reason) => console.log(`获取当前插件状态失败 - ${reason}`))
    .finally(() => panel_loading.value = false)
}

//拉取面板信息
const reloadPanel = () => {
    panel_loading.value = true
    getPanel().then(refreshPanel)
    .catch((reason) => console.log(`获取当前面板状态失败 - ${reason}`))
    .finally(() => panel_loading.value = false)
}

const commitVolume = (value : number, refresh : boolean = false) => {
    volume_uploading.value = true
    setVolume(value).then((v) => {
        if (refresh) panel_volume.value = v
    }).finally(() => volume_uploading.value = false)
}

//提交音量更新
const handleVolume = () => {
    if (volume_uploading.value) return

    commitVolume(panel_volume.value / 100)
}

//提交最终音量更新
const handleVolumeComplete = () => {
    if (panel_loading.value || volume_uploading.value) {
        //循环检测并保证提交
        let interval = setInterval(() => {
            if (!panel_loading.value && !volume_uploading.value) {
                clearInterval(interval)
                handlePanel(PanelAction.Volume, panel_volume.value / 100)
            }
        }, 100)
        return
    }

    handlePanel(PanelAction.Volume, panel_volume.value / 100)
}

//显示面板
const show = () => {
    reloadPanel()
    panel_shown.value = true
}

const isShown = () : boolean => panel_shown.value

const emit = defineEmits(['pass'])

defineExpose({ show, isShown })

</script>

<style>

.panel-dialog {
    display: flex;
    --van-button-primary-background: #409EFF;
    --van-button-primary-border-color: rgb(121, 187, 255);
    background: rgb(235, 242, 249);
    z-index: 103;
    flex-direction: column;
    overflow: hidden;
}

.panel-buttons-group {
    width: 100%;

    display: flex;
    margin: 2.5rem 0.3rem 1rem 0.3rem;
    justify-content: center;
    align-items: center;
}

.panel-volume-group {
    flex-direction: row;
    margin: 0.5rem 0.3rem 1rem 0.3rem;
}

.panel-volume-content {
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;

    flex: 1;
    margin: 0 2rem;
}

.panel-volume {
    margin: 0 1.5rem;
}

.panel-button {
    font-size: 1rem;
    margin: 0 3rem;
}

.panel-button-round {
    width: var(--van-button-default-height);
    height: var(--van-button-default-height);
}

.panel-nickname-box {
    margin: 0.3rem 0.8rem;
}

</style>
