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

  const fn = handlerModule[fnName]
  if (typeof fn !== 'function') {
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
    const result = await fn(...args)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
