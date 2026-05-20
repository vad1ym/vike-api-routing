import { isDefineRoute } from '../define.js'
import type { ApiContext, MiddlewareFn } from '../types.js'

async function runWithMiddlewares(
  middlewares: MiddlewareFn[],
  req: Request,
  handle: () => Promise<unknown>,
): Promise<unknown> {
  const respond = async (): Promise<Response> => {
    const result = await handle()
    if (result instanceof Response) return result
    if (result == null) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  let chain = respond
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i]
    const next = chain
    chain = () => mw(req, next)
  }

  const response = await chain()
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: response.statusText }))
    throw Object.assign(new Error((data as { message?: string }).message ?? response.statusText), { status: response.status })
  }
  return response.headers.get('content-type')?.includes('application/json')
    ? response.json()
    : response.text()
}

/**
 * Dispatch an incoming /_rpc/handlerName/fnName POST request.
 *
 * Expects body: JSON array of arguments.
 * Returns: JSON result or error.
 */
export async function dispatchRpc(
  req: Request,
  handlers: Record<string, Record<string, (...args: unknown[]) => unknown>>,
  rpcPrefix: string,
): Promise<Response | null> {
  const url = new URL(req.url, 'http://localhost')

  if (!url.pathname.startsWith(rpcPrefix + '/')) return null
  if (req.method !== 'POST') return null

  const rest = url.pathname.slice(rpcPrefix.length + 1)
  const slashIdx = rest.indexOf('/')
  if (slashIdx === -1) return null

  const handlerName = rest.slice(0, slashIdx)
  const fnName = rest.slice(slashIdx + 1)

  const handlerModule = handlers[handlerName]
  if (!handlerModule) {
    return new Response(JSON.stringify({ message: `Handler "${handlerName}" not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // A DefineRouteResult is itself the handler — no fnName lookup needed
  const fn: unknown = isDefineRoute(handlerModule) ? handlerModule : handlerModule[fnName]
  if (!isDefineRoute(fn) && typeof fn !== 'function') {
    return new Response(JSON.stringify({ message: `Function "${fnName}" not found in handler "${handlerName}"` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let args: unknown[] = []
  try {
    const body = await req.text()
    if (body) args = JSON.parse(body)
  } catch {
    return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    let result: unknown
    if (isDefineRoute(fn as unknown)) {
      // fn is a DefineRouteResult — build ApiContext from args[0] and run middleware chain
      const arg = (args[0] ?? {}) as { params?: Record<string, string>; body?: unknown; query?: unknown }
      const ctx: ApiContext = {
        params: arg.params ?? {},
        req,
        method: req.method,
      }
      const allMiddlewares = fn.middlewares
      result = await runWithMiddlewares(allMiddlewares, req, () => fn.handler(ctx))
    } else {
      result = await fn(...args)
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = (err as { status?: number }).status ?? 500
    return new Response(JSON.stringify({ message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
