import { describe, it, expect } from 'vitest'
import { segmentToHono, filePathToRoutePath, fileNameToMethod, routeSpecificity, sortRoutesBySpecificity, getMiddlewareChainPaths } from '../lib/plugin/pathUtils.js'

describe('segmentToHono', () => {
  it('converts @id to :id', () => {
    expect(segmentToHono('@id')).toBe(':id')
  })

  it('converts @...rest to *', () => {
    expect(segmentToHono('@...rest')).toBe('*')
    expect(segmentToHono('@...slug')).toBe('*')
  })

  it('keeps literal segments as-is', () => {
    expect(segmentToHono('users')).toBe('users')
    expect(segmentToHono('robots.txt')).toBe('robots.txt')
  })

  it('drops route group segments from the URL path', () => {
    expect(segmentToHono('(auth)')).toBe('')
  })
})

describe('filePathToRoutePath', () => {
  it('converts simple file to route', () => {
    expect(filePathToRoutePath('get.ts', '/api')).toBe('/api')
  })

  it('converts nested file to route', () => {
    expect(filePathToRoutePath('users/get.ts', '/api')).toBe('/api/users')
  })

  it('converts dynamic segment', () => {
    expect(filePathToRoutePath('users/@id/get.ts', '/api')).toBe('/api/users/:id')
  })

  it('converts wildcard segment', () => {
    expect(filePathToRoutePath('files/@...rest/get.ts', '/api')).toBe('/api/files/*')
  })

  it('works without prefix (routes/)', () => {
    expect(filePathToRoutePath('robots.txt/get.ts', '')).toBe('/robots.txt')
  })

  it('deeply nested route', () => {
    expect(filePathToRoutePath('users/@id/posts/@postId/get.ts', '/api')).toBe('/api/users/:id/posts/:postId')
  })

  it('ignores route groups when building API routes', () => {
    expect(filePathToRoutePath('(auth)/sign-in/post.ts', '/api')).toBe('/api/sign-in')
  })

  it('ignores route groups when building custom routes', () => {
    expect(filePathToRoutePath('(meta)/robots.txt/get.ts', '')).toBe('/robots.txt')
  })
})

describe('fileNameToMethod', () => {
  it('converts get.ts to GET', () => {
    expect(fileNameToMethod('get.ts')).toBe('GET')
  })

  it('converts post.ts to POST', () => {
    expect(fileNameToMethod('post.ts')).toBe('POST')
  })

  it('converts all.ts to ALL', () => {
    expect(fileNameToMethod('all.ts')).toBe('ALL')
  })

  it('converts delete.ts to DELETE', () => {
    expect(fileNameToMethod('delete.ts')).toBe('DELETE')
  })

  it('throws on unknown filename', () => {
    expect(() => fileNameToMethod('unknown.ts')).toThrow()
  })
})

describe('routeSpecificity', () => {
  it('static routes score higher than dynamic', () => {
    expect(routeSpecificity('/api/users')).toBeGreaterThan(routeSpecificity('/api/:id'))
  })

  it('dynamic routes score higher than wildcards', () => {
    expect(routeSpecificity('/api/:id')).toBeGreaterThan(routeSpecificity('/api/*'))
  })

  it('longer static routes score higher', () => {
    expect(routeSpecificity('/api/users/profile')).toBeGreaterThan(routeSpecificity('/api/users'))
  })
})

describe('sortRoutesBySpecificity', () => {
  it('sorts static before dynamic before wildcard', () => {
    const routes = [
      { path: '/api/*' },
      { path: '/api/users' },
      { path: '/api/:id' },
    ]
    const sorted = sortRoutesBySpecificity(routes)
    expect(sorted[0].path).toBe('/api/users')
    expect(sorted[1].path).toBe('/api/:id')
    expect(sorted[2].path).toBe('/api/*')
  })

  it('does not mutate the original array', () => {
    const routes = [{ path: '/api/*' }, { path: '/api/users' }]
    const original = [...routes]
    sortRoutesBySpecificity(routes)
    expect(routes).toEqual(original)
  })
})

describe('getMiddlewareChainPaths', () => {
  it('returns chain from root to leaf', () => {
    const chain = getMiddlewareChainPaths('api/users/@id')
    expect(chain).toEqual([
      'api/middleware.ts',
      'api/users/middleware.ts',
      'api/users/@id/middleware.ts',
    ])
  })

  it('returns single entry for top-level dir', () => {
    const chain = getMiddlewareChainPaths('api')
    expect(chain).toEqual(['api/middleware.ts'])
  })
})
