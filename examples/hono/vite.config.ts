import { defineConfig } from 'vite'
import vike from 'vike/plugin'
import { vikeApiRouter } from 'vike-api-router/plugin'

export default defineConfig({
  plugins: [
    vikeApiRouter(),
    vike(),
  ],
})
