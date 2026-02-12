<template>
  <div class="main-container">
    <!-- 当前播放 -->
    <van-notice-bar
      class="playing-status"
      v-if="current"
      left-icon="play-circle-o"
      color="#1989fa"
      background="#ecf9ff"
      :text="current ? `正在播放: ${current.title} (来自 ${current.order})` : ''"
    />

    <!-- 内容 -->
    <div class="content-container">
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

    <!-- 底部导航栏 -->
    <tabbar
      v-model="active_page"
      ref="tab"
      @book="book_dialog_shown = true"
    />
    <div class="virtual-tabbar-box" :style="`height: ${max_content_height};`" />

    <!-- 控制面板悬浮气泡 -->
    <van-floating-bubble
      v-model:offset="bubble_offset"
      axis="xy"
      icon="list-switching"
      magnetic="x"
      class="control-bubble"
      @offset-change="handleBubbleMove"
      @click="panel.show()"
    />
    
    <!-- 控制面板 -->
    <panel
      ref="panel"
      @pass="pass_shown = true"
    />

    <!-- 用户凭据对话框 -->
    <pass-dialog v-model="pass_shown" />

    <!-- 点歌对话框 -->
    <book-dialog
      v-model="book_dialog_shown"
      @loading="(e) => loading_book = e"
      @refresh="handleBookRefresh"
    />

    <!-- 加载遮罩层 -->
    <van-overlay style="z-index: 3000;" :show="isLoading()">
      <div class="loading-wrapper">
        <div class="loading-block">
          <van-loading color="#1989fa" />
          <text class="loading-text">加载中</text>
        </div>
      </div>
    </van-overlay>
  </div>
</template>

<script setup lang="ts">
import { queryCurrent } from './common/easyk_api';
import BookList from './components/book-list.vue';
import OutdateList from './components/outdate-list.vue';
import Tabbar from './components/tabbar.vue';
import Panel from './components/panel.vue';
import BookDialog from './components/book-dialog.vue';
import PassDialog from './components/pass-dialog.vue';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { BookListItem } from './common/book_interfaces';

//主界面相关
const active_page = ref<number>(0)
const max_content_height = ref<string>('calc(100% - 4rem)')
const bubble_offset = ref({ x: 0, y: 0 })
const tab = ref()
const book_list = ref()

//当前播放
const current = ref<BookListItem | undefined>(undefined)
const refresh_interval = ref()

//控制面板
const panel = ref()

//点歌界面
const book_dialog_shown = ref<boolean>(false)

//用户凭据
const pass_shown = ref<boolean>(false)

//加载相关
const loading_books = ref<boolean>(false)
const loading_outdates = ref<boolean>(false)
const loading_book = ref<boolean>(false)

const isLoading = () => loading_books.value || loading_outdates.value || loading_book.value

//气泡移动
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

//刷新当前播放
const reloadCurrent = () => {
  queryCurrent().then((c) => {
    current.value = c
  }).catch((reason) => console.log(`获取当前播放信息失败 - ${reason}`))
}

//刷新当前播放(定时)
const updateState = () => {
  if (document.visibilityState !== 'visible' || isLoading() || panel.value.isShown() || book_dialog_shown.value) return

  reloadCurrent()
}

//刷新已点列表
const handleBookRefresh = () => {
  if (active_page.value == 0 && book_list.value)
    book_list.value.reload()
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

  refresh_interval.value = setInterval(updateState, 10000)
  nextTick(reloadCurrent)
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

.playing-status {
  width: 100%;
}

.virtual-tabbar-box {
  display: block;
  width: 100%;
  min-height: 4rem;
}

</style>
