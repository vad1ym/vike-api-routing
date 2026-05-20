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
    if (route.namedExport) {
      lines.push(`import { ${route.namedExport} as handler_${i} } from ${JSON.stringify(route.moduleId)}`)
    } else {
      lines.push(`import handler_${i} from ${JSON.stringify(route.moduleId)}`)
    }
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
export function generateHandlersModule(
  handler: HandlerEntry | null,
  rpcPrefix: string,
  routeHandlers: RouteEntry[] = [],
): string {
  const lines: string[] = []
  const namedRoutes = routeHandlers.filter(r => r.namedExport)

  if (handler) {
    lines.push(`import _handlers from ${JSON.stringify(handler.moduleId)}`)
  }
  namedRoutes.forEach((route, i) => {
    lines.push(`import { ${route.namedExport} as _route_${i} } from ${JSON.stringify(route.moduleId)}`)
  })

  lines.push('')
  lines.push(`export const rpcPrefix = ${JSON.stringify(rpcPrefix)}`)
  lines.push('export const handlers = {')
  if (handler) lines.push('  ..._handlers,')
  namedRoutes.forEach((route, i) => {
    lines.push(`  ${JSON.stringify(route.namedExport!)}: _route_${i},`)
  })
  lines.push('}')

  lines.push('')
  return lines.join('\n')
}

/**
 * Generate the handlers client virtual module code.
 *
 * Exports a default Proxy that lazily creates per-handler proxies.
 * Each property access returns an async function that POSTs to /_rpc/handlerName/fnName.
 */
export function generateHandlersClientModule(
  handler: HandlerEntry | null,
  rpcPrefix: string,
  routeHandlers: RouteEntry[] = [],
): string {
  const lines: string[] = []
  const handlerNames = handler?.names ?? []
  const namedRoutes = routeHandlers.filter(r => r.namedExport)
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

  if (namedRoutes.some(r => !r.proxyTarget)) {
    lines.push('function _routeCall(method, routePath) {')
    lines.push('  return async (ctx = {}) => {')
    lines.push('    let url = routePath')
    lines.push('    if (ctx.params) {')
    lines.push('      for (const [k, v] of Object.entries(ctx.params)) {')
    lines.push('        url = url.replace(`:${k}`, encodeURIComponent(v))')
    lines.push('      }')
    lines.push('    }')
    lines.push('    if (ctx.query) {')
    lines.push('      const qs = new URLSearchParams(ctx.query).toString()')
    lines.push('      if (qs) url += `?${qs}`')
    lines.push('    }')
    lines.push('    const res = await fetch(url, {')
    lines.push('      method,')
    lines.push('      headers: { "Content-Type": "application/json" },')
    lines.push('      body: ctx.body !== undefined ? JSON.stringify(ctx.body) : undefined,')
    lines.push('    })')
    lines.push('    if (!res.ok) {')
    lines.push('      const err = await res.json().catch(() => ({ message: res.statusText }))')
    lines.push('      throw new Error(err.message ?? res.statusText)')
    lines.push('    }')
    lines.push('    if (res.status === 204) return undefined')
    lines.push('    return res.json()')
    lines.push('  }')
    lines.push('}')
    lines.push('')
  }

  if (handler && handlerNames.length > 0) {
    lines.push(`const _ssrHandlers = import.meta.env.SSR`)
    lines.push(`  ? (await import(${JSON.stringify(handler.moduleId)})).default`)
    lines.push(`  : null`)
    lines.push('')
  }

  for (const name of handlerNames) {
    lines.push(`export const ${name} = import.meta.env.SSR`)
    lines.push(`  ? _ssrHandlers[${JSON.stringify(name)}]`)
    lines.push(`  : new Proxy({}, {`)
    lines.push(`      get(_, fnName) { return typeof fnName === 'string' ? _rpc(${JSON.stringify(name)}, fnName) : undefined },`)
    lines.push(`    })`)
  }

  for (const route of namedRoutes) {
    const name = route.namedExport!
    if (route.proxyTarget) {
      // defineProxyRoute — SSR runs the route handler through its middleware chain, browser uses RPC-style proxy
      const middlewareImports = route.middlewares.map((mw, i) => `(await import(${JSON.stringify(mw)})).default`)
      const middlewaresExpr = `[${middlewareImports.join(', ')}]`
      lines.push(`export const ${name} = import.meta.env.SSR`)
      lines.push(`  ? await (async () => {`)
      lines.push(`      const { ${name}: _r } = await import(${JSON.stringify(route.moduleId)})`)
      lines.push(`      const _mws = ${middlewaresExpr}`)
      lines.push(`      async function _call(method, path, opts = {}) {`)
      lines.push(`        const url = new URL(path, 'http://localhost')`)
      lines.push(`        if (opts.query) for (const [k, v] of Object.entries(opts.query)) if (v != null) url.searchParams.set(k, String(v))`)
      lines.push(`        const hasBody = method !== 'GET' && method !== 'HEAD'`)
      lines.push(`        const req = new Request(url.href, {`)
      lines.push(`          method,`)
      lines.push(`          headers: opts.headers ? new Headers(opts.headers) : undefined,`)
      lines.push(`          body: hasBody && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,`)
      lines.push(`          signal: opts.signal,`)
      lines.push(`        })`)
      lines.push(`        const ctx = { params: {}, req, method }`)
      lines.push(`        let chain = () => Promise.resolve(_r.handler(ctx))`)
      lines.push(`        for (let _i = _mws.length - 1; _i >= 0; _i--) {`)
      lines.push(`          const mw = _mws[_i], next = chain`)
      lines.push(`          chain = () => mw(req, next)`)
      lines.push(`        }`)
      lines.push(`        const res = await chain()`)
      lines.push(`        if (res instanceof Response) {`)
      lines.push(`          if (res.status === 204) return undefined`)
      lines.push(`          const ct = res.headers.get('content-type') ?? ''`)
      lines.push(`          return ct.includes('application/json') ? res.json() : res.text()`)
      lines.push(`        }`)
      lines.push(`        return res`)
      lines.push(`      }`)
      lines.push(`      return {`)
      lines.push(`        get: (p, o) => _call('GET', p, o),`)
      lines.push(`        post: (p, o) => _call('POST', p, o),`)
      lines.push(`        put: (p, o) => _call('PUT', p, o),`)
      lines.push(`        patch: (p, o) => _call('PATCH', p, o),`)
      lines.push(`        delete: (p, o) => _call('DELETE', p, o),`)
      lines.push(`        request: (m, p, o) => _call(m, p, o),`)
      lines.push(`      }`)
      lines.push(`    })()`)
      lines.push(`  : new Proxy({}, {`)
      lines.push(`      get(_, fnName) { return typeof fnName === 'string' ? _rpc(${JSON.stringify(name)}, fnName) : undefined },`)
      lines.push(`    })`)
    } else {
      const middlewareImports = route.middlewares.map(mw => `(await import(${JSON.stringify(mw)})).default`)
      const middlewaresExpr = `[${middlewareImports.join(', ')}]`
      lines.push(`export const ${name} = import.meta.env.SSR`)
      lines.push(`  ? async (ctx = {}) => {`)
      lines.push(`      const { ${name}: _r } = await import(${JSON.stringify(route.moduleId)})`)
      lines.push(`      const _mws = ${middlewaresExpr}`)
      lines.push(`      const req = new Request('http://localhost', { method: ${JSON.stringify(route.method)} })`)
      lines.push(`      const apiCtx = { params: ctx.params ?? {}, req, method: ${JSON.stringify(route.method)} }`)
      lines.push(`      let chain = () => Promise.resolve(_r.handler(apiCtx))`)
      lines.push(`      for (let _i = _mws.length - 1; _i >= 0; _i--) {`)
      lines.push(`        const mw = _mws[_i], next = chain`)
      lines.push(`        chain = () => mw(req, next)`)
      lines.push(`      }`)
      lines.push(`      const res = await chain()`)
      lines.push(`      if (res instanceof Response) {`)
      lines.push(`        if (res.status === 204) return undefined`)
      lines.push(`        const ct = res.headers.get('content-type') ?? ''`)
      lines.push(`        return ct.includes('application/json') ? res.json() : res.text()`)
      lines.push(`      }`)
      lines.push(`      return res`)
      lines.push(`    }`)
      lines.push(`  : _routeCall(${JSON.stringify(route.method)}, ${JSON.stringify(route.path)})`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Generate the handlers.d.ts declaration file content.
 *
 * Re-exports every named export from each handler module so that TypeScript
 * knows what's available when importing from 'vike-api-router/handlers'.
 */
export function generateHandlersDts(handler: HandlerEntry | null, routeHandlers: RouteEntry[] = []): string {
  const lines: string[] = []
  const namedRoutes = routeHandlers.filter(r => r.namedExport)

  lines.push(`declare module 'vike-api-router/handlers' {`)

  if (handler) {
    for (const name of handler.names) {
      lines.push(`  export const ${name}: (typeof import(${JSON.stringify(handler.moduleId)}))['default'][${JSON.stringify(name)}]`)
    }
  }
  for (const route of namedRoutes) {
    if (route.proxyTarget) {
      lines.push(`  export const ${route.namedExport}: import('vike-api-router/proxy').ProxyHandlerClient`)
    } else {
      lines.push(`  export const ${route.namedExport}: (ctx?: { params?: Record<string, string>; body?: unknown; query?: Record<string, unknown> }) => Promise<unknown>`)
    }
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
