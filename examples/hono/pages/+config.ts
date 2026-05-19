import type { Config } from 'vike/types'
import vikeVue from 'vike-vue/config'
import vikeApiRouter from 'vike-api-router/config'

export default {
  extends: [vikeVue, vikeApiRouter],
} satisfies Config
