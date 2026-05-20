import type { ApiContext } from './types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProxyRouteOptions = {
  target: string | URL
  headers?: HeadersInit | ((ctx: ApiContext) => HeadersInit | Promise<HeadersInit>)
  forwardHeaders?: boolean | string[]
  stripHeaders?: string[]
  rewritePath?: (ctx: ApiContext) => string
  rewriteUrl?: (url: URL, ctx: ApiContext) => URL | Promise<URL>
  onRequest?: (request: Request, ctx: ApiContext) => Request | Response | Promise<Request | Response>
  onResponse?: (response: Response, ctx: ApiContext) => Response | Promise<Response>
}

export type ProxyHandlerOptions = {
  target: string | URL
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  fetch?: typeof fetch
  onRequest?: (request: Request) => Request | Promise<Request>
  onResponse?: (response: Response) => Response | Promise<Response>
}

export type RequestOptions = {
  query?: Record<string, unknown>
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
}

export interface ProxyHandlerClient {
  get(path: string, options?: RequestOptions): Promise<unknown>
  post(path: string, options?: RequestOptions): Promise<unknown>
  put(path: string, options?: RequestOptions): Promise<unknown>
  patch(path: string, options?: RequestOptions): Promise<unknown>
  delete(path: string, options?: RequestOptions): Promise<unknown>
  request(method: string, path: string, options?: RequestOptions): Promise<unknown>
}

// ─── ProxyError ───────────────────────────────────────────────────────────────

export class ProxyError extends Error {
  status: number
  data: unknown
  response: Response

  constructor(status: number, data: unknown, response: Response) {
    super(`Proxy request failed with status ${status}`)
    this.name = 'ProxyError'
    this.status = status
    this.data = data
    this.response = response
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FORWARD_HEADERS = ['accept', 'accept-language', 'content-type', 'user-agent']
const DEFAULT_STRIP_HEADERS = ['host', 'connection', 'content-length', 'accept-encoding']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTargetUrl(target: string | URL): URL {
  return target instanceof URL ? target : new URL(target)
}

function buildUpstreamUrl(targetBase: URL, path: string, search: string): URL {
  const basePath = targetBase.pathname.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const upstreamUrl = new URL(targetBase.href)
  upstreamUrl.pathname = basePath + normalizedPath
  upstreamUrl.search = search
  return upstreamUrl
}

function pickHeaders(
  incoming: Headers,
  forwardHeaders: boolean | string[],
  stripHeaders: string[],
  extraHeaders: HeadersInit,
): Headers {
  const out = new Headers(extraHeaders)
  const stripSet = new Set(stripHeaders.map((h) => h.toLowerCase()))

  if (forwardHeaders === true) {
    incoming.forEach((value, key) => {
      if (!stripSet.has(key.toLowerCase())) out.set(key, value)
    })
  } else if (Array.isArray(forwardHeaders)) {
    for (const key of forwardHeaders) {
      if (!stripSet.has(key.toLowerCase())) {
        const value = incoming.get(key)
        if (value !== null) out.set(key, value)
      }
    }
  }

  return out
}

// ─── proxyRoute ───────────────────────────────────────────────────────────────

/**
 * Returns a RouteHandler that proxies incoming requests to an upstream target.
 * Designed for use as the default export of a +all.ts wildcard route file.
 *
 * @example
 * // server/api/github/@...path/+all.ts
 * import { proxyRoute } from 'vike-api-router/proxy'
 * export default proxyRoute({ target: 'https://api.github.com' })
 */
export function proxyRoute(options: ProxyRouteOptions) {
  const {
    target,
    forwardHeaders = DEFAULT_FORWARD_HEADERS,
    stripHeaders = DEFAULT_STRIP_HEADERS,
    rewritePath,
    rewriteUrl,
    onRequest,
    onResponse,
  } = options

  const targetBase = resolveTargetUrl(target)

  return async (ctx: ApiContext): Promise<Response> => {
    const { req } = ctx

    let path: string
    if (rewritePath) {
      path = rewritePath(ctx)
    } else if (ctx.params['*'] !== undefined) {
      path = ctx.params['*']
    } else {
      path = new URL(req.url).pathname
    }

    const incomingUrl = new URL(req.url)
    let upstreamUrl = buildUpstreamUrl(targetBase, path, incomingUrl.search)

    if (rewriteUrl) {
      upstreamUrl = await rewriteUrl(upstreamUrl, ctx)
    }

    const extraHeaders = options.headers
      ? typeof options.headers === 'function'
        ? await options.headers(ctx)
        : options.headers
      : {}

    const outHeaders = pickHeaders(req.headers, forwardHeaders, stripHeaders, extraHeaders)

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    let upstreamRequest = new Request(upstreamUrl.href, {
      method: req.method,
      headers: outHeaders,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error — duplex is required by some edge runtimes but missing from lib.dom.d.ts
      duplex: hasBody ? 'half' : undefined,
    })

    let upstreamResponse: Response | undefined
    if (onRequest) {
      const result = await onRequest(upstreamRequest, ctx)
      if (result instanceof Response) {
        upstreamResponse = result
      } else {
        upstreamRequest = result
      }
    }

    if (!upstreamResponse) upstreamResponse = await fetch(upstreamRequest)

    if (onResponse) upstreamResponse = await onResponse(upstreamResponse, ctx)

    return upstreamResponse
  }
}

// ─── proxyHandler ─────────────────────────────────────────────────────────────

/**
 * Returns a typed HTTP client for server-side use. Handles JSON serialization,
 * query string building, and throws ProxyError on non-2xx responses.
 *
 * @example
 * // server/handlers/github.ts
 * import { proxyHandler } from 'vike-api-router/proxy'
 * export const github = proxyHandler({ target: 'https://api.github.com' })
 */
export function proxyHandler(options: ProxyHandlerOptions): ProxyHandlerClient {
  const { target, fetch: customFetch = fetch, onRequest, onResponse } = options
  const targetBase = resolveTargetUrl(target)

  async function request(method: string, path: string, opts: RequestOptions = {}): Promise<unknown> {
    const { query, body, headers: extraHeaders, signal } = opts

    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const url = new URL(targetBase.href)
    url.pathname = targetBase.pathname.replace(/\/$/, '') + normalizedPath

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
      }
    }

    const baseHeaders = options.headers
      ? typeof options.headers === 'function'
        ? await options.headers()
        : options.headers
      : {}

    const outHeaders = new Headers(baseHeaders)
    if (extraHeaders) new Headers(extraHeaders).forEach((v, k) => outHeaders.set(k, v))

    let serializedBody: BodyInit | undefined
    if (body !== undefined) {
      serializedBody = JSON.stringify(body)
      if (!outHeaders.has('content-type')) outHeaders.set('content-type', 'application/json')
    }

    let req = new Request(url.href, {
      method: method.toUpperCase(),
      headers: outHeaders,
      body: serializedBody,
      signal,
    })

    if (onRequest) req = await onRequest(req)

    let res = await customFetch(req)

    if (onResponse) res = await onResponse(res)

    if (res.status === 204) return undefined

    const contentType = res.headers.get('content-type') ?? ''
    const data = contentType.includes('application/json') ? await res.json() : await res.text()

    if (!res.ok) throw new ProxyError(res.status, data, res)

    return data
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
    request,
  }
}
