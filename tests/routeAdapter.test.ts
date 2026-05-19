import { describe, it, expect } from 'vitest'
import { buildRouteHandler, createRouter } from '../lib/middleware/routeAdapter.js'
import type { RouteManifestEntry } from '../lib/middleware/routeAdapter.js'

function makeRequest(url: string, method = 'GET'): Request {
  return new Request(`http://localhost${url}`, { method })
}

describe('buildRouteHandler — response normalization', () => {
  it('passes through a Response object', async () => {
    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/test',
      middlewares: [],
      handler: async () => new Response('hello', { status: 200 }),
    }
    const handle = buildRouteHandler(entry)
    const res = await handle(makeRequest('/api/test'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
  })

  it('serializes plain object to JSON 200', async () => {
    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/test',
      middlewares: [],
      handler: async () => ({ id: 1, name: 'Alice' }),
    }
    const handle = buildRouteHandler(entry)
    const res = await handle(makeRequest('/api/test'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(await res.json()).toEqual({ id: 1, name: 'Alice' })
  })

  it('returns 204 for null', async () => {
    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/test',
      middlewares: [],
      handler: async () => null,
    }
    const handle = buildRouteHandler(entry)
    const res = await handle(makeRequest('/api/test'))
    expect(res.status).toBe(204)
  })

  it('returns 204 for undefined', async () => {
    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/test',
      middlewares: [],
      handler: async () => undefined,
    }
    const handle = buildRouteHandler(entry)
    const res = await handle(makeRequest('/api/test'))
    expect(res.status).toBe(204)
  })
})

describe('buildRouteHandler — params extraction', () => {
  it('passes dynamic params to handler', async () => {
    let captured: Record<string, string> = {}
    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/users/:id',
      middlewares: [],
      handler: async ({ params }) => { captured = params; return null },
    }
    const handle = buildRouteHandler(entry)
    await handle(makeRequest('/api/users/123'))
    expect(captured.id).toBe('123')
  })

  it('passes wildcard to handler', async () => {
    let captured: Record<string, string> = {}
    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/*',
      middlewares: [],
      handler: async ({ params }) => { captured = params; return null },
    }
    const handle = buildRouteHandler(entry)
    await handle(makeRequest('/api/files/a/b/c'))
    expect(captured['*']).toBe('files/a/b/c')
  })
})

describe('buildRouteHandler — middleware chain', () => {
  it('runs middlewares in order before handler', async () => {
    const log: string[] = []

    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/test',
      middlewares: [
        async (req, next) => { log.push('mw1'); return next() },
        async (req, next) => { log.push('mw2'); return next() },
      ],
      handler: async () => { log.push('handler'); return null },
    }

    const handle = buildRouteHandler(entry)
    await handle(makeRequest('/api/test'))
    expect(log).toEqual(['mw1', 'mw2', 'handler'])
  })

  it('middleware can short-circuit without calling next()', async () => {
    const log: string[] = []

    const entry: RouteManifestEntry = {
      method: 'GET',
      path: '/api/test',
      middlewares: [
        async () => {
          log.push('mw-block')
          return new Response('blocked', { status: 401 })
        },
      ],
      handler: async () => { log.push('handler'); return null },
    }

    const handle = buildRouteHandler(entry)
    const res = await handle(makeRequest('/api/test'))
    expect(res.status).toBe(401)
    expect(log).toEqual(['mw-block'])
    expect(log).not.toContain('handler')
  })
})

describe('createRouter', () => {
  it('dispatches to matching route', async () => {
    const router = createRouter([
      {
        method: 'GET',
        path: '/api/users',
        middlewares: [],
        handler: async () => ({ users: [] }),
      },
    ])

    const res = await router.dispatch(makeRequest('/api/users'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
  })

  it('returns null for unmatched route', async () => {
    const router = createRouter([
      {
        method: 'GET',
        path: '/api/users',
        middlewares: [],
        handler: async () => ({}),
      },
    ])

    const res = await router.dispatch(makeRequest('/api/other'))
    expect(res).toBeNull()
  })

  it('matches by method — ignores wrong method', async () => {
    const router = createRouter([
      {
        method: 'GET',
        path: '/api/users',
        middlewares: [],
        handler: async () => ({}),
      },
    ])

    const res = await router.dispatch(makeRequest('/api/users', 'POST'))
    expect(res).toBeNull()
  })

  it('ALL method matches any HTTP verb', async () => {
    const router = createRouter([
      {
        method: 'ALL',
        path: '/api/health',
        middlewares: [],
        handler: async ({ method }) => ({ method }),
      },
    ])

    for (const verb of ['GET', 'POST', 'DELETE', 'PUT']) {
      const res = await router.dispatch(makeRequest('/api/health', verb))
      expect(res).not.toBeNull()
      const body = await res!.json()
      expect(body.method).toBe(verb)
    }
  })

  it('matches dynamic segments', async () => {
    const router = createRouter([
      {
        method: 'GET',
        path: '/api/users/:id',
        middlewares: [],
        handler: async ({ params }) => ({ id: params.id }),
      },
    ])

    const res = await router.dispatch(makeRequest('/api/users/42'))
    expect(res).not.toBeNull()
    expect(await res!.json()).toEqual({ id: '42' })
  })
})
