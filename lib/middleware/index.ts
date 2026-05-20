import { enhance } from '@universal-middleware/core'
import { createRouter, type RouteManifestEntry } from './routeAdapter.js'
import { dispatchRpc } from './rpcAdapter.js'
import type { MiddlewareFn, RouteHandler } from '../types.js'

let router: ReturnType<typeof createRouter> | null = null
let rpcHandlers: Record<string, Record<string, (...args: unknown[]) => unknown>> | null = null
let rpcPrefix: string = '/_rpc'

async function ensureInitialized() {
  if (router) return

  const [routesModule, handlersModule] = await Promise.all([
    import('virtual:vike-api-router/routes' as string),
    import('virtual:vike-api-router/handlers' as string),
  ])

  const routes = routesModule.routes as Array<{
    method: string
    path: string
    handler: RouteHandler
    middlewares: MiddlewareFn[]
  }>

  router = createRouter(routes as RouteManifestEntry[])
  rpcHandlers = handlersModule.handlers as Record<string, Record<string, (...args: unknown[]) => unknown>>
  rpcPrefix = handlersModule.rpcPrefix as string
}

async function handle(request: Request, _context: unknown, _runtime: unknown): Promise<Response | void> {
  await ensureInitialized()

  const rpcResponse = await dispatchRpc(request, rpcHandlers!, rpcPrefix)
  if (rpcResponse) return rpcResponse

  return router!.dispatch(request)
}

export const vikeApiRouterMiddleware = enhance(handle, {})
