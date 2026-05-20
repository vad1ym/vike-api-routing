import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scanServerDir } from '../lib/plugin/scanner.js'

// Create a temporary directory tree simulating a server/ folder
function createTmpServer(structure: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vike-api-router-'))

  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }

  return dir
}

let tmpDir: string

afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('scanServerDir', () => {
  beforeAll(() => {
    tmpDir = createTmpServer({
      'api/+get.ts': 'export default () => ({})',
      'api/+middleware.ts': 'export default async (req, next) => next()',
      'api/users/+get.ts': 'export default () => ({})',
      'api/users/+post.ts': 'export default () => ({})',
      'api/users/+middleware.ts': 'export default async (req, next) => next()',
      'api/users/@id/+get.ts': 'export default () => ({})',
      'api/users/@id/+delete.ts': 'export default () => null',
      'api/health/+all.ts': 'export default () => ({})',
      'api/(auth)/+middleware.ts': 'export default async (req, next) => next()',
      'api/(auth)/sign-in/+post.ts': 'export default () => ({ ok: true })',
      'routes/robots.txt/+get.ts': 'export default () => new Response("")',
      'routes/(meta)/sitemap.xml/+get.ts': 'export default () => new Response("")',
      'handlers/index.ts': 'export default { userHandler: { getUser: async (id) => ({}) } }',
    })
  })

  it('scans api/ and produces correct paths', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    const paths = manifest.apiRoutes.map(r => `${r.method} ${r.path}`)

    expect(paths).toContain('GET /api')
    expect(paths).toContain('GET /api/users')
    expect(paths).toContain('POST /api/users')
    expect(paths).toContain('GET /api/users/:id')
    expect(paths).toContain('DELETE /api/users/:id')
    expect(paths).toContain('ALL /api/health')
    expect(paths).toContain('POST /api/sign-in')
  })

  it('scans routes/ without prefix', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    const paths = manifest.customRoutes.map(r => r.path)
    expect(paths).toContain('/robots.txt')
    expect(paths).toContain('/sitemap.xml')
  })

  it('scans handlers/index.ts as handler entry', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    expect(manifest.handlers).not.toBeNull()
    expect(manifest.handlers!.moduleId).toContain('handlers/index.ts')
  })

  it('attaches correct global middleware to /api route', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    const root = manifest.apiRoutes.find(r => r.path === '/api' && r.method === 'GET')
    expect(root).toBeDefined()
    // Global api/+middleware.ts should be in the chain
    expect(root!.middlewares.some(m => m.includes('+middleware.ts'))).toBe(true)
  })

  it('attaches cumulative middlewares for nested routes', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    const userById = manifest.apiRoutes.find(r => r.path === '/api/users/:id' && r.method === 'GET')
    expect(userById).toBeDefined()
    // Should have both api/+middleware.ts and api/users/+middleware.ts
    expect(userById!.middlewares).toHaveLength(2)
  })

  it('routes without parent middleware have no middleware', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    const health = manifest.apiRoutes.find(r => r.path === '/api/health')
    expect(health).toBeDefined()
    // api/+middleware.ts exists, so health should have 1 middleware
    expect(health!.middlewares).toHaveLength(1)
  })

  it('keeps route-group middleware in the chain while omitting the group from the URL', () => {
    const manifest = scanServerDir(tmpDir, '/api')
    const signIn = manifest.apiRoutes.find(r => r.path === '/api/sign-in' && r.method === 'POST')
    expect(signIn).toBeDefined()
    expect(signIn!.middlewares).toHaveLength(2)
    expect(signIn!.middlewares.some(m => m.includes('api/(auth)/+middleware.ts'))).toBe(true)
  })

  it('sorts routes: static before dynamic before wildcard', () => {
    const tmp2 = createTmpServer({
      'api/users/+get.ts': '',
      'api/@id/+get.ts': '',
      'api/@...rest/+get.ts': '',
    })

    try {
      const manifest = scanServerDir(tmp2, '/api')
      const paths = manifest.apiRoutes.map(r => r.path)
      expect(paths.indexOf('/api/users')).toBeLessThan(paths.indexOf('/api/:id'))
      expect(paths.indexOf('/api/:id')).toBeLessThan(paths.indexOf('/api/*'))
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true })
    }
  })

  it('returns empty arrays when directories do not exist', () => {
    const empty = createTmpServer({})
    try {
      const manifest = scanServerDir(empty, '/api')
      expect(manifest.apiRoutes).toHaveLength(0)
      expect(manifest.customRoutes).toHaveLength(0)
      expect(manifest.handlers).toBeNull()
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })
})
