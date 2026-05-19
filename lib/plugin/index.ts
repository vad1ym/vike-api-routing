import path from 'node:path'
import type { Plugin } from 'vite'
import { scanServerDir } from './scanner.js'
import {
  ROUTES_MODULE_ID,
  HANDLERS_MODULE_ID,
  HANDLERS_CLIENT_MODULE_ID,
  RESOLVED_ROUTES_MODULE_ID,
  RESOLVED_HANDLERS_MODULE_ID,
  RESOLVED_HANDLERS_CLIENT_MODULE_ID,
  generateRoutesModule,
  generateHandlersModule,
  generateHandlersClientModule,
} from './virtual.js'

export interface VikeApiRouterOptions {
  /** Directory containing api/, routes/, and handlers/ subdirectories. Default: 'server' */
  serverDir?: string
  /** URL prefix for api/ routes. Default: '/api' */
  apiPrefix?: string
  /** URL prefix for RPC handler calls. Default: '/_rpc' */
  rpcPrefix?: string
}

export function vikeApiRouter(options: VikeApiRouterOptions = {}): Plugin {
  const { apiPrefix = '/api', rpcPrefix = '/_rpc' } = options

  let rootDir = process.cwd()
  let serverDir: string

  function getServerDir(): string {
    return serverDir ?? path.resolve(rootDir, options.serverDir ?? 'server')
  }

  function generateRoutes() {
    const manifest = scanServerDir(getServerDir(), apiPrefix)
    return {
      routesCode: generateRoutesModule(manifest.apiRoutes, manifest.customRoutes),
      handlersCode: generateHandlersModule(manifest.handlers, rpcPrefix),
      handlersClientCode: generateHandlersClientModule(manifest.handlers, rpcPrefix),
    }
  }

  return {
    name: 'vike-api-router',

    configResolved(config) {
      rootDir = config.root
      serverDir = path.resolve(rootDir, options.serverDir ?? 'server')
    },

    resolveId(id) {
      if (id === ROUTES_MODULE_ID) return RESOLVED_ROUTES_MODULE_ID
      if (id === HANDLERS_MODULE_ID) return RESOLVED_HANDLERS_MODULE_ID
      if (id === HANDLERS_CLIENT_MODULE_ID) return RESOLVED_HANDLERS_CLIENT_MODULE_ID
    },

    load(id) {
      const { routesCode, handlersCode, handlersClientCode } = generateRoutes()

      if (id === RESOLVED_ROUTES_MODULE_ID) return routesCode
      if (id === RESOLVED_HANDLERS_MODULE_ID) return handlersCode
      if (id === RESOLVED_HANDLERS_CLIENT_MODULE_ID) return handlersClientCode
    },

    configureServer(server) {
      const watchDir = getServerDir()
      server.watcher.add(watchDir)

      server.watcher.on('add', (file) => {
        if (!file.startsWith(watchDir)) return
        invalidateVirtualModules(server)
      })

      server.watcher.on('unlink', (file) => {
        if (!file.startsWith(watchDir)) return
        invalidateVirtualModules(server)
      })
    },

    handleHotUpdate({ file, server }) {
      const watchDir = getServerDir()
      if (!file.startsWith(watchDir)) return

      invalidateVirtualModules(server)
    },
  }
}

function invalidateVirtualModules(server: import('vite').ViteDevServer): void {
  for (const id of [RESOLVED_ROUTES_MODULE_ID, RESOLVED_HANDLERS_MODULE_ID, RESOLVED_HANDLERS_CLIENT_MODULE_ID]) {
    const mod = server.moduleGraph.getModuleById(id)
    if (mod) server.moduleGraph.invalidateModule(mod)
  }
  server.ws.send({ type: 'full-reload' })
}
