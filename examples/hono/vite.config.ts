import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vike from 'vike/plugin'
import { vikeApiRouter } from 'vike-api-router/plugin'

export default defineConfig({
  plugins: [
    vikeApiRouter(),
    vue(),
    vike(),
  ],
})
