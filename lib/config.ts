import type { Config } from 'vike/types'

// Register our +get, +post, etc. as known Vike configs so Vike doesn't throw
// "sets an unknown config X" when it encounters server/api/+get.ts etc.
// env: { config: true } means the value is only used at config-time (never bundled).
const routeFileMeta = { env: { config: true }, global: false as const }

export default {
  name: 'vike-api-router',
  meta: {
    get: routeFileMeta,
    post: routeFileMeta,
    put: routeFileMeta,
    patch: routeFileMeta,
    delete: routeFileMeta,
    head: routeFileMeta,
    options: routeFileMeta,
    all: routeFileMeta,
    middleware: routeFileMeta,
  },
} satisfies Config
