import type { RouteEntry, HandlerEntry } from './scanner.js'

// Virtual module IDs
export const ROUTES_MODULE_ID = 'virtual:vike-api-router/routes'
export const HANDLERS_MODULE_ID = 'virtual:vike-api-router/handlers'
export const HANDLERS_CLIENT_MODULE_ID = 'virtual:vike-api-router/handlers-client'

export const RESOLVED_ROUTES_MODULE_ID = '\0' + ROUTES_MODULE_ID
export const RESOLVED_HANDLERS_MODULE_ID = '\0' + HANDLERS_MODULE_ID
export const RESOLVED_HANDLERS_CLIENT_MODULE_ID = '\0' + HANDLERS_CLIENT_MODULE_ID

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
export function generateHandlersModule(handlers: HandlerEntry[], rpcPrefix: string): string {
  const lines: string[] = []

  handlers.forEach((handler, i) => {
    lines.push(`import * as handler_${i} from ${JSON.stringify(handler.moduleId)}`)
  })

  lines.push('')
  lines.push(`export const rpcPrefix = ${JSON.stringify(rpcPrefix)}`)
  lines.push('')
  lines.push('export const handlers = {')

  handlers.forEach((handler, i) => {
    lines.push(`  ${JSON.stringify(handler.name)}: handler_${i},`)
  })

  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate the handlers client virtual module code.
 *
 * Exports proxy objects that call fetch('/_rpc/handlerName/fnName', ...) under the hood.
 * Each handler export is a function that serializes args and deserializes the response.
 */
export function generateHandlersClientModule(handlers: HandlerEntry[], rpcPrefix: string): string {
  const lines: string[] = []

  lines.push(`const rpcPrefix = ${JSON.stringify(rpcPrefix)}`)
  lines.push('')
  lines.push('function makeProxy(handlerName) {')
  lines.push('  return new Proxy({}, {')
  lines.push('    get(_, fnName) {')
  lines.push('      return async (...args) => {')
  lines.push('        const res = await fetch(`${rpcPrefix}/${handlerName}/${String(fnName)}`, {')
  lines.push('          method: "POST",')
  lines.push('          headers: { "Content-Type": "application/json" },')
  lines.push('          body: JSON.stringify(args),')
  lines.push('        })')
  lines.push('        if (!res.ok) {')
  lines.push('          const err = await res.json().catch(() => ({ message: res.statusText }))')
  lines.push('          throw new Error(err.message ?? res.statusText)')
  lines.push('        }')
  lines.push('        return res.json()')
  lines.push('      }')
  lines.push('    }')
  lines.push('  })')
  lines.push('}')
  lines.push('')
  lines.push('export const handlers = {')

  handlers.forEach((handler) => {
    lines.push(`  ${JSON.stringify(handler.name)}: makeProxy(${JSON.stringify(handler.name)}),`)
  })

  lines.push('}')
  lines.push('')

  return lines.join('\n')
}
