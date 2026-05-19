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

      // In dev, Vite handles requests directly (no +server.ts).
      // Register our middleware on the Vite dev server so API routes work.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          try {
            const { createRouter } = await import('../middleware/routeAdapter.js')
            const { dispatchRpc } = await import('../middleware/rpcAdapter.js')

            // Dynamically import route handlers
            const { routes } = await server.ssrLoadModule(ROUTES_MODULE_ID) as { routes: any[] }
            const { handlers, rpcPrefix: prefix } = await server.ssrLoadModule(HANDLERS_MODULE_ID) as { handlers: any; rpcPrefix: string }

            const url = `http://localhost${req.url ?? '/'}`
            const body = await readBody(req)
            const request = new Request(url, {
              method: req.method ?? 'GET',
              headers: req.headers as HeadersInit,
              body: body.length > 0 ? new Uint8Array(body) : undefined,
            })

            const rpcRes = await dispatchRpc(request, handlers, prefix)
            if (rpcRes) return sendResponse(rpcRes, res)

            const router = createRouter(routes)
            const routeRes = await router.dispatch(request)
            if (routeRes) return sendResponse(routeRes, res)
          } catch (e) {
            console.error('[vike-api-router]', e)
          }
          next()
        })
      }
    },

    handleHotUpdate({ file, server }) {
      const watchDir = getServerDir()
      if (!file.startsWith(watchDir)) return

      invalidateVirtualModules(server)
    },
  }
}

function readBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function sendResponse(response: Response, res: import('node:http').ServerResponse): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const body = await response.arrayBuffer()
  res.end(Buffer.from(body))
}

function invalidateVirtualModules(server: import('vite').ViteDevServer): void {
  for (const id of [RESOLVED_ROUTES_MODULE_ID, RESOLVED_HANDLERS_MODULE_ID, RESOLVED_HANDLERS_CLIENT_MODULE_ID]) {
    const mod = server.moduleGraph.getModuleById(id)
    if (mod) server.moduleGraph.invalidateModule(mod)
  }
  server.ws.send({ type: 'full-reload' })
}
