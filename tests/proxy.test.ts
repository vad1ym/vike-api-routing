import { describe, it, expect, vi } from 'vitest'
import { proxyRoute, proxyHandler, ProxyError } from '../lib/proxy.js'
import type { ApiContext } from '../lib/types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(
  url: string,
  method = 'GET',
  params: Record<string, string> = {},
): ApiContext {
  return { req: new Request(url, { method }), method, params }
}

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(
        body !== undefined ? JSON.stringify(body) : null,
        { status, headers: contentType ? { 'content-type': contentType } : {} },
      ),
    ),
  )
}

// ─── proxyRoute — URL construction ───────────────────────────────────────────

describe('proxyRoute — URL construction', () => {
  it('appends wildcard param to target', async () => {
    let capturedUrl = ''
    const handler = proxyRoute({
      target: 'https://api.example.com',
      onRequest: (req) => { capturedUrl = req.url; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/github/repos/foo', 'GET', { '*': 'repos/foo' }))
    expect(capturedUrl).toBe('https://api.example.com/repos/foo')
  })

  it('preserves query string', async () => {
    let capturedUrl = ''
    const handler = proxyRoute({
      target: 'https://api.example.com',
      onRequest: (req) => { capturedUrl = req.url; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/search?q=hello', 'GET', { '*': 'search' }))
    expect(new URL(capturedUrl).search).toBe('?q=hello')
  })

  it('falls back to req.url path when no wildcard param', async () => {
    let capturedUrl = ''
    const handler = proxyRoute({
      target: 'https://api.example.com',
      onRequest: (req) => { capturedUrl = req.url; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/users', 'GET', {}))
    expect(new URL(capturedUrl).pathname).toBe('/api/users')
  })

  it('uses rewritePath when provided', async () => {
    let capturedUrl = ''
    const handler = proxyRoute({
      target: 'https://api.example.com',
      rewritePath: () => '/v2/users',
      onRequest: (req) => { capturedUrl = req.url; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/users', 'GET', { '*': 'users' }))
    expect(new URL(capturedUrl).pathname).toBe('/v2/users')
  })

  it('calls rewriteUrl with the constructed URL', async () => {
    let capturedUrl = ''
    const handler = proxyRoute({
      target: 'https://api.example.com',
      rewriteUrl: (url) => { url.pathname = '/rewritten'; return url },
      onRequest: (req) => { capturedUrl = req.url; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/users', 'GET', { '*': 'users' }))
    expect(new URL(capturedUrl).pathname).toBe('/rewritten')
  })

  it('preserves target base path prefix', async () => {
    let capturedUrl = ''
    const handler = proxyRoute({
      target: 'https://api.example.com/v2',
      onRequest: (req) => { capturedUrl = req.url; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/users', 'GET', { '*': 'users' }))
    expect(new URL(capturedUrl).pathname).toBe('/v2/users')
  })
})

// ─── proxyRoute — header forwarding ──────────────────────────────────────────

describe('proxyRoute — header forwarding', () => {
  it('forwards default headers', async () => {
    let capturedHeaders = new Headers()
    const handler = proxyRoute({
      target: 'https://api.example.com',
      onRequest: (req) => { capturedHeaders = req.headers; return new Response('ok') },
    })

    const req = new Request('http://localhost/api/test', {
      headers: { 'accept': 'application/json', 'user-agent': 'vitest', 'cookie': 'secret=abc' },
    })
    await handler({ req, method: 'GET', params: { '*': 'test' } })
    expect(capturedHeaders.get('accept')).toBe('application/json')
    expect(capturedHeaders.get('user-agent')).toBe('vitest')
    expect(capturedHeaders.get('cookie')).toBeNull()
  })

  it('forwards all headers when forwardHeaders=true', async () => {
    let capturedHeaders = new Headers()
    const handler = proxyRoute({
      target: 'https://api.example.com',
      forwardHeaders: true,
      onRequest: (req) => { capturedHeaders = req.headers; return new Response('ok') },
    })

    const req = new Request('http://localhost/api/test', {
      headers: { 'x-custom': 'yes', 'authorization': 'Bearer tok' },
    })
    await handler({ req, method: 'GET', params: {} })
    expect(capturedHeaders.get('x-custom')).toBe('yes')
    expect(capturedHeaders.get('authorization')).toBe('Bearer tok')
  })

  it('strips host header when forwardHeaders=true', async () => {
    let capturedHeaders = new Headers()
    const handler = proxyRoute({
      target: 'https://api.example.com',
      forwardHeaders: true,
      onRequest: (req) => { capturedHeaders = req.headers; return new Response('ok') },
    })

    const req = new Request('http://localhost/api/test', {
      headers: { 'x-custom': 'yes' },
    })
    await handler({ req, method: 'GET', params: {} })
    expect(capturedHeaders.get('host')).toBeNull()
    expect(capturedHeaders.get('x-custom')).toBe('yes')
  })

  it('merges static extra headers', async () => {
    let capturedHeaders = new Headers()
    const handler = proxyRoute({
      target: 'https://api.example.com',
      headers: { 'x-api-key': 'secret' },
      onRequest: (req) => { capturedHeaders = req.headers; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/test', 'GET'))
    expect(capturedHeaders.get('x-api-key')).toBe('secret')
  })

  it('merges dynamic extra headers from function', async () => {
    let capturedHeaders = new Headers()
    const handler = proxyRoute({
      target: 'https://api.example.com',
      headers: async () => ({ 'x-token': 'dynamic' }),
      onRequest: (req) => { capturedHeaders = req.headers; return new Response('ok') },
    })

    await handler(makeCtx('http://localhost/api/test', 'GET'))
    expect(capturedHeaders.get('x-token')).toBe('dynamic')
  })
})

// ─── proxyRoute — response passthrough ───────────────────────────────────────

describe('proxyRoute — response passthrough', () => {
  it('returns the upstream response as-is', async () => {
    const handler = proxyRoute({
      target: 'https://api.example.com',
      onRequest: () => new Response('{"id":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
    })

    const res = await handler(makeCtx('http://localhost/api/test'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1 })
  })

  it('calls onResponse and returns its result', async () => {
    const handler = proxyRoute({
      target: 'https://api.example.com',
      onRequest: () => new Response('original', { status: 200 }),
      onResponse: () => new Response('modified', { status: 202 }),
    })

    const res = await handler(makeCtx('http://localhost/api/test'))
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('modified')
  })
})

// ─── proxyHandler — HTTP methods ─────────────────────────────────────────────

describe('proxyHandler — HTTP methods', () => {
  it('makes a GET request', async () => {
    const fetchMock = mockFetch(200, { result: 'ok' })
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })
    const data = await client.get('/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [req] = fetchMock.mock.calls[0] as [Request]
    expect(req.method).toBe('GET')
    expect(new URL(req.url).pathname).toBe('/users')
    expect(data).toEqual({ result: 'ok' })
  })

  it('makes a POST request with JSON body', async () => {
    const fetchMock = mockFetch(201, { id: 99 })
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })
    const data = await client.post('/items', { body: { name: 'test' } })
    const [req] = fetchMock.mock.calls[0] as [Request]
    expect(req.method).toBe('POST')
    expect(req.headers.get('content-type')).toContain('application/json')
    expect(await req.json()).toEqual({ name: 'test' })
    expect(data).toEqual({ id: 99 })
  })

  it('makes PUT, PATCH, DELETE requests', async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      const fetchMock = mockFetch(200, {})
      const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })
      await client[method]('/resource')
      const [req] = fetchMock.mock.calls[0] as [Request]
      expect(req.method).toBe(method.toUpperCase())
    }
  })

  it('appends query params to URL', async () => {
    const fetchMock = mockFetch(200, [])
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })
    await client.get('/search', { query: { q: 'hello', page: 2 } })
    const [req] = fetchMock.mock.calls[0] as [Request]
    const url = new URL(req.url)
    expect(url.searchParams.get('q')).toBe('hello')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('returns undefined for 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })
    const result = await client.delete('/items/1')
    expect(result).toBeUndefined()
  })

  it('preserves target base path prefix', async () => {
    const fetchMock = mockFetch(200, {})
    const client = proxyHandler({ target: 'https://api.example.com/v2', fetch: fetchMock })
    await client.get('/users')
    const [req] = fetchMock.mock.calls[0] as [Request]
    expect(new URL(req.url).pathname).toBe('/v2/users')
  })
})

// ─── proxyHandler — error handling ───────────────────────────────────────────

describe('proxyHandler — error handling', () => {
  it('throws ProxyError on 4xx', async () => {
    const fetchMock = mockFetch(404, { message: 'not found' })
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })

    await expect(client.get('/missing')).rejects.toBeInstanceOf(ProxyError)
    await expect(client.get('/missing')).rejects.toMatchObject({ status: 404, data: { message: 'not found' } })
  })

  it('throws ProxyError on 5xx', async () => {
    const fetchMock = mockFetch(503, { error: 'unavailable' })
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })

    await expect(client.get('/health')).rejects.toMatchObject({ status: 503 })
  })

  it('ProxyError has .response reference', async () => {
    const fetchMock = mockFetch(401, { error: 'unauthorized' })
    const client = proxyHandler({ target: 'https://api.example.com', fetch: fetchMock })

    try {
      await client.get('/secure')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError)
      expect((e as ProxyError).response).toBeInstanceOf(Response)
    }
  })
})

// ─── proxyHandler — hooks ─────────────────────────────────────────────────────

describe('proxyHandler — hooks', () => {
  it('calls onRequest to mutate the outgoing request', async () => {
    const fetchMock = mockFetch(200, {})
    const client = proxyHandler({
      target: 'https://api.example.com',
      fetch: fetchMock,
      onRequest: (req) => new Request(req, { headers: { ...Object.fromEntries(req.headers), 'x-injected': 'yes' } }),
    })

    await client.get('/test')
    const [req] = fetchMock.mock.calls[0] as [Request]
    expect(req.headers.get('x-injected')).toBe('yes')
  })

  it('calls onResponse to transform the response', async () => {
    const fetchMock = mockFetch(200, { original: true })
    const client = proxyHandler({
      target: 'https://api.example.com',
      fetch: fetchMock,
      onResponse: async (res) => {
        const body = await res.json() as Record<string, unknown>
        return new Response(JSON.stringify({ ...body, modified: true }), { status: res.status, headers: res.headers })
      },
    })

    const data = await client.get('/test') as Record<string, unknown>
    expect(data.modified).toBe(true)
  })

  it('merges static base headers on every request', async () => {
    const fetchMock = mockFetch(200, {})
    const client = proxyHandler({
      target: 'https://api.example.com',
      headers: { authorization: 'Bearer static' },
      fetch: fetchMock,
    })

    await client.get('/a')
    await client.get('/b')
    for (const [req] of fetchMock.mock.calls as [Request][]) {
      expect(req.headers.get('authorization')).toBe('Bearer static')
    }
  })

  it('calls dynamic headers function per request', async () => {
    let count = 0
    const fetchMock = mockFetch(200, {})
    const client = proxyHandler({
      target: 'https://api.example.com',
      headers: () => { count++; return { 'x-call': String(count) } },
      fetch: fetchMock,
    })

    await client.get('/a')
    await client.get('/b')
    expect(count).toBe(2)
  })
})
