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

/**
 * universal-middleware compatible middleware.
 *
 * Signature: (request, context, runtime) => Response | void
 * Returns Response if the request is handled, void to pass through.
 */
async function handle(request: Request): Promise<Response | void> {
  await ensureInitialized()

  const rpcResponse = await dispatchRpc(request, rpcHandlers!, rpcPrefix)
  if (rpcResponse) return rpcResponse

  return router!.dispatch(request) ?? undefined
}

/**
 * File-based API router middleware for Vike.
 *
 * Compatible with universal-middleware — works with @vikejs/hono, @vikejs/h3, etc.
 *
 * ```ts
 * // +server.ts (Hono)
 * import vike from '@vikejs/hono'
 * import { vikeApiRouterMiddleware } from 'vike-api-router'
 *
 * vike(app, [vikeApiRouterMiddleware])
 * ```
 */
export const vikeApiRouterMiddleware = () => handle
