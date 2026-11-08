import '@vant/touch-emulator'

import './style.css'

import { createApp } from 'vue'
import App from './App.vue'

let app = createApp(App)

// import { initLogger } from '@/common/logger'
// initLogger('/api/debug')

app.mount('#app')
