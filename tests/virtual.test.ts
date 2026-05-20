import { describe, it, expect } from 'vitest'
import { generateHandlersDts, generateHandlersClientModule } from '../lib/plugin/virtual.js'
import type { HandlerEntry, RouteEntry } from '../lib/plugin/scanner.js'

describe('generateHandlersDts', () => {
  it('generates empty declaration when no handler', () => {
    const result = generateHandlersDts(null)
    expect(result).toContain(`declare module 'vike-api-router/handlers'`)
    expect(result).not.toContain('export')
  })

  it('generates typed named exports for each handler name', () => {
    const handler: HandlerEntry = { moduleId: '/project/server/handlers.ts', names: ['oladoctor', 'github'] }
    const result = generateHandlersDts(handler)
    expect(result).toContain(`export const oladoctor`)
    expect(result).toContain(`export const github`)
    expect(result).toContain(`/project/server/handlers.ts`)
  })

  it('generates callable type for named route export', () => {
    const route: RouteEntry = {
      method: 'PUT',
      path: '/api/users/:id',
      moduleId: '/project/server/api/users/@id/put.ts',
      middlewares: [],
      namedExport: 'updateUser',
    }
    const result = generateHandlersDts(null, [route])
    expect(result).toContain(`export const updateUser`)
    expect(result).toContain(`Promise<unknown>`)
    expect(result).not.toContain(`DefineRouteResult`)
  })
})

describe('generateHandlersClientModule — named route exports', () => {
  const route: RouteEntry = {
    method: 'PUT',
    path: '/api/users/:id',
    moduleId: '/project/server/api/users/@id/put.ts',
    middlewares: [],
    namedExport: 'updateUser',
  }

  it('generates _routeCall for named route export (not _rpc)', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [route])
    expect(result).toContain('_routeCall')
    expect(result).toContain('"PUT"')
    expect(result).toContain('"/api/users/:id"')
    expect(result).not.toContain('_rpc("updateUser"')
  })

  it('generates _rpc for regular handler entries', () => {
    const handler: HandlerEntry = { moduleId: '/project/server/handlers.ts', names: ['oladoctor'] }
    const result = generateHandlersClientModule(handler, '/_rpc', [])
    expect(result).toContain(`_rpc("oladoctor"`)
    expect(result).not.toContain('_routeCall')
  })

  it('generates SSR direct call for named route export', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [route])
    expect(result).toContain('import.meta.env.SSR')
    expect(result).toContain('/project/server/api/users/@id/put.ts')
    expect(result).toContain('updateUser')
  })

  it('SSR path runs middleware chain for defineRoute', () => {
    const routeWithMw: RouteEntry = {
      ...route,
      middlewares: ['/project/server/api/middleware.ts'],
    }
    const result = generateHandlersClientModule(null, '/_rpc', [routeWithMw])
    expect(result).toContain('/project/server/api/middleware.ts')
    expect(result).toContain('_mws')
    expect(result).toContain('_r.handler')
  })

  it('SSR path has empty middleware array when no middlewares', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [route])
    expect(result).toContain('const _mws = []')
  })
})

describe('generateHandlersDts — defineProxyRoute', () => {
  it('emits ProxyHandlerClient type for proxyTarget route', () => {
    const route: RouteEntry = {
      method: 'ALL',
      path: '/api/*',
      moduleId: '/project/server/api/@...rest/all.ts',
      middlewares: [],
      namedExport: 'proxy',
      proxyTarget: 'https://api.example.com',
    }
    const result = generateHandlersDts(null, [route])
    expect(result).toContain(`export const proxy`)
    expect(result).toContain(`ProxyHandlerClient`)
    expect(result).not.toContain('/project/server/api/@...rest/all.ts')
  })
})

describe('generateHandlersClientModule — defineProxyRoute', () => {
  const proxyRoute: RouteEntry = {
    method: 'ALL',
    path: '/api/*',
    moduleId: '/project/server/api/@...rest/all.ts',
    middlewares: [],
    namedExport: 'proxy',
    proxyTarget: 'https://api.example.com',
  }

  it('browser path uses _rpc proxy (not _routeCall)', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [proxyRoute])
    expect(result).toContain('_rpc("proxy"')
    expect(result).not.toContain('_routeCall')
  })

  it('SSR path imports the route module and runs middleware chain', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [proxyRoute])
    expect(result).toContain('import.meta.env.SSR')
    expect(result).toContain('/project/server/api/@...rest/all.ts')
    expect(result).toContain('_r.handler')
    expect(result).toContain('_mws')
  })

  it('SSR path includes middleware imports when middlewares present', () => {
    const route: RouteEntry = {
      ...proxyRoute,
      middlewares: [
        '/project/server/api/middleware.ts',
        '/project/server/api/@...rest/middleware.ts',
      ],
    }
    const result = generateHandlersClientModule(null, '/_rpc', [route])
    expect(result).toContain('/project/server/api/middleware.ts')
    expect(result).toContain('/project/server/api/@...rest/middleware.ts')
  })

  it('SSR path has no middleware imports when no middlewares', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [proxyRoute])
    // _mws should be empty array
    expect(result).toContain('const _mws = []')
  })

  it('SSR path exposes get/post/put/patch/delete/request methods', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [proxyRoute])
    expect(result).toContain(`get:`)
    expect(result).toContain(`post:`)
    expect(result).toContain(`put:`)
    expect(result).toContain(`patch:`)
    expect(result).toContain(`delete:`)
    expect(result).toContain(`request:`)
  })
})
