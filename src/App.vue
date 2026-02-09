<template>
  <div class="main-container">
    <van-notice-bar
      class="playing-status"
      v-if="current"
      left-icon="play-circle-o"
      color="#1989fa"
      background="#ecf9ff"
      :text="current ? `正在播放: ${current.title} (来自 ${current.order})` : ''"
    />
    <div
      class="content-container"
    >
      <book-list
        v-if="active_page == 0"
        ref="book_list"
        @loading="(e) => loading_books = e"
      />
      <outdate-list
        v-if="active_page == 2"
        @loading="(e) => loading_outdates = e"
      />
    </div>
    <div class="virtual-tabbar-box" :style="`height: ${max_content_height};`" />
    <tabbar
      v-model="active_page"
      ref="tab"
      @book="book_dialog_shown = true"
    />
    <van-floating-bubble
      v-model:offset="bubble_offset"
      axis="xy"
      icon="list-switching"
      magnetic="x"
      class="control-bubble"
      @offset-change="handleBubbleMove"
      @click="handlePanelShow"
    />
    <van-overlay style="z-index: 3000;" :show="isLoading()">
      <div class="loading-wrapper">
        <div class="loading-block">
          <van-loading color="#1989fa" />
          <text class="loading-text">加载中</text>
        </div>
      </div>
    </van-overlay>
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
        <van-button
          type="primary"
          icon="minus"
          class="panel-button-round panel-button"
          @click="handleVolume(false)"
          round
        />
        <text>音量</text>
        <van-button
          type="primary"
          icon="plus"
          class="panel-button-round panel-button"
          @click="handleVolume(true)"
          round
        />
      </div>
      <van-cell-group
        v-if="panel_accompaniment_valid"
        class="panel-nickname-box"
        inset
      >
        <van-cell center title="伴唱">
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
        <van-cell center title="显示假名">
          <template #right-icon>
            <van-switch
              v-model="panel_kana"
              :loading="panel_loading"
              @click="handlePanel(PanelAction.Kana, panel_kana)"
            />
          </template>
        </van-cell>
        <van-cell center title="显示翻译">
          <template #right-icon>
            <van-switch
              v-model="panel_translated"
              :loading="panel_loading"
              @click="handlePanel(PanelAction.Translated, panel_translated)"
            />
          </template>
        </van-cell>
        <van-cell center title="显示罗马音">
          <template #right-icon>
            <van-switch
              v-model="panel_roma"
              :loading="panel_loading"
              @click="handlePanel(PanelAction.Roma, panel_roma)"
            />
          </template>
        </van-cell>
      </van-cell-group>
      <van-cell-group class="panel-nickname-box" style="margin-bottom: 1rem;" inset>
        <van-field
          v-model="nickname"
          label="昵称"
          placeholder="在这写你的ID"
          @update:model-value="handleNickname"
        />
        <van-field
          v-model="passkey"
          label="授权码"
          placeholder="请输入授权码(选填)"
          type="password"
          @update:model-value="handlePassKey"
        >
          <template #button>
            <van-button
              size="small"
              type="primary"
              @click="handlePastePassKey"
            >
              粘贴
            </van-button>
          </template>
        </van-field>
      </van-cell-group>
    </van-popup>
    <van-dialog
      v-model:show="nickname_shown"
      @confirm="handleEmptyNickname"
    >
      <van-field
        class="empty-nickname"
        v-model="empty_nickname"
        label="昵称"
        placeholder="在这写你的ID(请不要留空)"
      />
      <van-field
        class="empty-nickname"
        v-model="empty_passkey"
        label="授权码"
        placeholder="请输入授权码(选填)"
        type="password"
      >
        <template #button>
          <van-button
            size="small"
            type="primary"
            @click="handlePasteEmptyPassKey"
          >
            粘贴
          </van-button>
        </template>
      </van-field>
    </van-dialog>
    <book-dialog
      v-model="book_dialog_shown"
      @loading="(e) => loading_book = e"
      @refresh="handleBookRefresh"
    />
  </div>
</template>

<script setup lang="ts">
import { getPanel, pause, PanelAction as PanelAction, push, queryCurrent, updatePanel, updateVolume, VolumeAction } from './common/easyk_api';
import BookList from './components/book-list.vue';
import OutdateList from './components/outdate-list.vue';
import Tabbar from './components/tabbar.vue';
import BookDialog from './components/book-dialog.vue';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { getCookie, setCookie } from './common/cookies';
import type { BookListItem } from './common/book_interfaces';

const empty_regex = new RegExp(/^\s*$/)

const active_page = ref<number>(0)

const panel_shown = ref<boolean>(false)

const nickname_shown = ref<boolean>(false)

const bubble_offset = ref({ x: 0, y: 0 })

const nickname = ref<string>('')
const passkey = ref<string>('')

const empty_nickname = ref<string>('')
const empty_passkey = ref<string>('')

const max_content_height = ref<string>('calc(100% - 4rem)')

const book_dialog_shown = ref<boolean>(false)

const current = ref<BookListItem | undefined>(undefined)

const tab = ref()
const book_list = ref()

const volume_waiting = ref<boolean>(false)
const volume_value = ref<number>(0)

const loading_books = ref<boolean>(false)
const loading_outdates = ref<boolean>(false)
const loading_action = ref<boolean>(false)
const loading_book = ref<boolean>(false)

const refresh_interval = ref()

const panel_accompaniment_valid = ref<boolean>(false)
const panel_accompaniment = ref<boolean>(false)
const panel_kana = ref<boolean>(false)
const panel_translated = ref<boolean>(false)
const panel_roma = ref<boolean>(false)
const panel_loading = ref<boolean>(false)

const isLoading = () => loading_books.value || loading_outdates.value || loading_book.value

const handleBubbleMove = () => {
  let max_top = 0
  
  if (tab.value) {
    for (let i = 0; i < tab.value.$el.children.length; i++) {
      if (tab.value.$el.children[i].offsetTop > max_top)
        max_top = tab.value.$el.children[i].offsetTop
    }
  } else {
    max_top = document.body.offsetHeight
  }

  if (bubble_offset.value.y > max_top - 24 - 48)
    bubble_offset.value.y = max_top - 24 - 48
}

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

const handleNickname = () => {
  if (nickname.value && nickname.value.length > 0)
    setCookie('name', encodeURI(nickname.value), 7)
}

const handlePassKey = () => {
  setCookie('key', passkey.value, 7)
}

const handleEmptyNickname = () => {
  if (empty_nickname.value.length == 0 || empty_nickname.value.match(empty_regex)) {
    nextTick(() => nickname_shown.value = true)
  } else {
    nickname.value = empty_nickname.value
    passkey.value = empty_passkey.value
    setCookie('name', encodeURI(nickname.value), 7)
    setCookie('key', passkey.value, 7)
  }
}

const handleBookRefresh = () => {
  if (active_page.value == 0 && book_list.value)
    book_list.value.reload()
}

const handlePastePassKey = async () => {
    try {
        const text = await navigator.clipboard.readText()
        passkey.value = text
        handlePassKey()
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

const handlePasteEmptyPassKey = async () => {
    try {
        const text = await navigator.clipboard.readText()
        empty_passkey.value = text
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

const handlePanelShow = () => {
  reloadPanel()
  panel_shown.value = true
}

const reloadCurrent = () => {
  queryCurrent().then((c) => {
    current.value = c
  }).catch((reason) => console.log(`获取当前播放信息失败 - ${reason}`))
}

const updateState = () => {
  if (document.visibilityState !== 'visible' || isLoading() || panel_shown.value || book_dialog_shown.value) return

  reloadCurrent()
}

const handleVolume = (up : boolean) => {
  if (volume_waiting.value) {
    volume_value.value += up ? 1 : -1
  } else {
    volume_waiting.value = true
    volume_value.value = up ? 1 : -1

    setTimeout(() => {
      if (volume_value.value == 0) {
        volume_waiting.value = false
        return
      }

      updateVolume(volume_value.value > 0 ? VolumeAction.Up : VolumeAction.Down, Math.abs(volume_value.value))
      volume_waiting.value = false
    }, 1000)
  }
}

const handlePanel = (id : PanelAction, value : any) => {
  panel_loading.value = true
  updatePanel(id, value).then((panel) => {
    panel_kana.value = panel[PanelAction.Kana] ?? false
    panel_translated.value = panel[PanelAction.Translated] ?? false
    panel_roma.value = panel[PanelAction.Roma] ?? false
  }).catch((reason) => console.log(`获取当前插件状态失败 - ${reason}`))
  .finally(() => panel_loading.value = false)
}

const reloadPanel = () => {
  panel_loading.value = true
  getPanel().then((panel) => {
    panel_accompaniment_valid.value = panel[PanelAction.Accompaniment] != undefined
    if (panel_accompaniment_valid.value) panel_accompaniment.value = panel[PanelAction.Accompaniment] ?? false

    panel_kana.value = panel[PanelAction.Kana] ?? false
    panel_translated.value = panel[PanelAction.Translated] ?? false
    panel_roma.value = panel[PanelAction.Roma] ?? false
  }).catch((reason) => console.log(`获取当前面板状态失败 - ${reason}`))
  .finally(() => panel_loading.value = false)
}

onMounted(() => {
  let max_top = 0
  
  if (tab.value) {
    for (let i = 0; i < tab.value.$el.children.length; i++) {
      if (tab.value.$el.children[i].offsetTop > max_top)
        max_top = tab.value.$el.children[i].offsetTop
    }
  } else {
    max_top = document.body.offsetHeight
  }

  max_content_height.value = `${document.body.offsetHeight - max_top}px`

  bubble_offset.value.x = 24
  bubble_offset.value.y = max_top - 24 - 48

  passkey.value = new URL(window.location.href).searchParams.get('pass') || getCookie('key') || ""
  setCookie('key', passkey.value, 7)

  nickname.value = decodeURI(getCookie('name') || "")
  if (nickname.value.match(empty_regex)) {
    empty_passkey.value = passkey.value
    nickname_shown.value = true
  }

  refresh_interval.value = setInterval(updateState, 10000)
  nextTick(() => {
    reloadCurrent()
    reloadPanel()
  })
})

onBeforeUnmount(() => {
  clearInterval(refresh_interval.value)
})

</script>

<style>
@import './assets/toast.css';

.main-container {
  display: flex;
  flex: 1;
  background: rgb(235, 242, 249);
  margin: 0;
  padding: 0;
  flex-direction: column;
}

.content-container {
  display: flex;
  flex: 1;
  overflow-y: auto;
}

.virtual-tabbar-box {
  display: block;
  width: 100%;
  height: var(--van-tabbar-height);
  background: transparent;
}

.control-bubble {
  z-index: 102;
}

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
  margin: 0.5rem 0.3rem 1rem 0.3rem;
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

.empty-nickname {
  margin: 1rem 1rem;
}

.playing-status {
  width: 100%;
}

.virtual-tabbar-box {
  display: block;
  width: 100%;
  min-height: 4rem;
}

</style>
