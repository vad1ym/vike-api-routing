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
    const handler: HandlerEntry = { moduleId: '/project/server/handlers/index.ts', names: ['oladoctor', 'github'] }
    const result = generateHandlersDts(handler)
    expect(result).toContain(`export const oladoctor`)
    expect(result).toContain(`export const github`)
    expect(result).toContain(`/project/server/handlers/index.ts`)
  })

  it('generates typed export for named route export', () => {
    const route: RouteEntry = {
      method: 'PUT',
      path: '/api/users/:id',
      moduleId: '/project/server/api/users/@id/+put.ts',
      middlewares: [],
      namedExport: 'updateUser',
    }
    const result = generateHandlersDts(null, [route])
    expect(result).toContain(`export const updateUser`)
    expect(result).toContain(`/project/server/api/users/@id/+put.ts`)
  })
})

describe('generateHandlersClientModule — named route exports', () => {
  const route: RouteEntry = {
    method: 'PUT',
    path: '/api/users/:id',
    moduleId: '/project/server/api/users/@id/+put.ts',
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
    const handler: HandlerEntry = { moduleId: '/project/server/handlers/index.ts', names: ['oladoctor'] }
    const result = generateHandlersClientModule(handler, '/_rpc', [])
    expect(result).toContain(`_rpc("oladoctor"`)
    expect(result).not.toContain('_routeCall')
  })

  it('generates SSR direct call for named route export', () => {
    const result = generateHandlersClientModule(null, '/_rpc', [route])
    expect(result).toContain('import.meta.env.SSR')
    expect(result).toContain('/project/server/api/users/@id/+put.ts')
    expect(result).toContain('updateUser')
  })
})
