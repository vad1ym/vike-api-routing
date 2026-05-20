import type { RouteEntry, HandlerEntry } from './scanner.js'

// Virtual module IDs
export const ROUTES_MODULE_ID = 'virtual:vike-api-router/routes'
export const HANDLERS_MODULE_ID = 'virtual:vike-api-router/handlers'
export const HANDLERS_CLIENT_MODULE_ID = 'virtual:vike-api-router/handlers-client'
export const HANDLERS_CLIENT_BARE_ID = 'vike-api-router/handlers'
export const MIDDLEWARE_MODULE_ID = 'virtual:vike-api-router/middleware'

export const RESOLVED_ROUTES_MODULE_ID = '\0' + ROUTES_MODULE_ID
export const RESOLVED_HANDLERS_MODULE_ID = '\0' + HANDLERS_MODULE_ID
export const RESOLVED_HANDLERS_CLIENT_MODULE_ID = '\0' + HANDLERS_CLIENT_MODULE_ID
export const RESOLVED_MIDDLEWARE_MODULE_ID = '\0' + MIDDLEWARE_MODULE_ID

/**
 * Generate the routes virtual module code.
 *
 * Exports a `routes` array of { method, path, handler, middlewares[] }.
 * Each handler is the default export from the route file.
 */
export function generateRoutesModule(apiRoutes: RouteEntry[], customRoutes: RouteEntry[]): string {
  const allRoutes = [...apiRoutes, ...customRoutes]
  const lines: string[] = []

  allRoutes.forEach((route, i) => {
    lines.push(`import handler_${i} from ${JSON.stringify(route.moduleId)}`)
    route.middlewares.forEach((mw, j) => {
      lines.push(`import middleware_${i}_${j} from ${JSON.stringify(mw)}`)
    })
  })

  lines.push('')
  lines.push('export const routes = [')

  allRoutes.forEach((route, i) => {
    const middlewareRefs = route.middlewares.map((_, j) => `middleware_${i}_${j}`).join(', ')
    lines.push(`  {`)
    lines.push(`    method: ${JSON.stringify(route.method)},`)
    lines.push(`    path: ${JSON.stringify(route.path)},`)
    lines.push(`    handler: handler_${i},`)
    lines.push(`    middlewares: [${middlewareRefs}],`)
    lines.push(`  },`)
  })

  lines.push(']')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate the handlers virtual module code (server-side).
 *
 * Exports a `handlers` object mapping handler name → { fnName → fn }.
 * Also exports `rpcPrefix` for the dispatcher to use.
 */
export function generateHandlersModule(handler: HandlerEntry | null, rpcPrefix: string): string {
  const lines: string[] = []

  if (handler) {
    lines.push(`import _handlers from ${JSON.stringify(handler.moduleId)}`)
    lines.push('')
    lines.push(`export const rpcPrefix = ${JSON.stringify(rpcPrefix)}`)
    lines.push('export const handlers = _handlers')
  } else {
    lines.push(`export const rpcPrefix = ${JSON.stringify(rpcPrefix)}`)
    lines.push('export const handlers = {}')
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Generate the handlers client virtual module code.
 *
 * Exports a default Proxy that lazily creates per-handler proxies.
 * Each property access returns an async function that POSTs to /_rpc/handlerName/fnName.
 */
export function generateHandlersClientModule(_handler: HandlerEntry | null, rpcPrefix: string): string {
  const lines: string[] = []

  lines.push(`const _prefix = ${JSON.stringify(rpcPrefix)}`)
  lines.push('')
  lines.push('function _rpc(handlerName, fnName) {')
  lines.push('  return async (...args) => {')
  lines.push('    const res = await fetch(`${_prefix}/${handlerName}/${fnName}`, {')
  lines.push('      method: "POST",')
  lines.push('      headers: { "Content-Type": "application/json" },')
  lines.push('      body: JSON.stringify(args),')
  lines.push('    })')
  lines.push('    if (!res.ok) {')
  lines.push('      const err = await res.json().catch(() => ({ message: res.statusText }))')
  lines.push('      throw new Error(err.message ?? res.statusText)')
  lines.push('    }')
  lines.push('    return res.json()')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('export default new Proxy({}, {')
  lines.push('  get(_, handlerName) {')
  lines.push('    if (typeof handlerName !== "string") return undefined')
  lines.push('    return new Proxy({}, {')
  lines.push('      get(_, fnName) {')
  lines.push('        if (typeof fnName !== "string") return undefined')
  lines.push('        return _rpc(handlerName, fnName)')
  lines.push('      }')
  lines.push('    })')
  lines.push('  }')
  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate the handlers.d.ts declaration file content.
 *
 * Re-exports every named export from each handler module so that TypeScript
 * knows what's available when importing from 'vike-api-router/handlers'.
 */
export function generateHandlersDts(handler: HandlerEntry | null): string {
  const lines: string[] = []

  lines.push(`declare module 'vike-api-router/handlers' {`)

  if (handler) {
    lines.push(`  export { default } from ${JSON.stringify(handler.moduleId)}`)
  }

  lines.push(`}`)
  lines.push(``)

  return lines.join('\n')
}

/**
 * Generate the middleware virtual module code.
 *
 * Imports routes and handlers statically (resolved by Vite at bundle time),
 * so the middleware can be used in +server.ts without runtime virtual: imports
 * that would break in SSR worker threads.
 */
export function generateMiddlewareModule(): string {
  // String is built dynamically to prevent tsup from treating these as real imports
  const v = 'virtual:vike-api-router'
  const lines = [
    `import { enhance } from '@universal-middleware/core'`,
    `import { routes } from '${v}/routes'`,
    `import { handlers, rpcPrefix } from '${v}/handlers'`,
    `import { createRouter } from 'vike-api-router/internal/routeAdapter'`,
    `import { dispatchRpc } from 'vike-api-router/internal/rpcAdapter'`,
    ``,
    `async function handle(request, _context, _runtime) {`,
    `  const rpcResponse = await dispatchRpc(request, handlers, rpcPrefix)`,
    `  if (rpcResponse) return rpcResponse`,
    `  return createRouter(routes).dispatch(request)`,
    `}`,
    ``,
    `export const vikeApiRouterMiddleware = enhance(handle, {})`,
  ]
  return lines.join('\n') + '\n'
}
