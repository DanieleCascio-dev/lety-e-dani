import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

import './assets/main.css'

import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAppAuthAndStorage } from './composables/useAppStorage'

const app = createApp(App)

registerSW({ immediate: true })

void initAppAuthAndStorage().then(() => {
  app.use(router)
  app.mount('#app')
})
