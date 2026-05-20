import fs from 'node:fs'
import path from 'node:path'
import { fileNameToMethod, filePathToRoutePath, getMiddlewareChainPaths, sortRoutesBySpecificity } from './pathUtils.js'

export interface RouteEntry {
  /** HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, ALL */
  method: string
  /** Hono-compatible route path, e.g. /api/users/:id */
  path: string
  /** Absolute path to the route module file */
  moduleId: string
  /** Ordered list of absolute paths to +middleware.ts files (root → leaf) */
  middlewares: string[]
}

export interface HandlerEntry {
  /** Absolute path to server/handlers/index.ts */
  moduleId: string
  /** Handler names extracted from the default export object keys */
  names: string[]
}

export interface RouteManifest {
  apiRoutes: RouteEntry[]
  customRoutes: RouteEntry[]
  handlers: HandlerEntry | null
}

const SKIPPED_DIRS = new Set(['.git', '.vite', 'dist', 'node_modules'])
const METHOD_FILE_RE = /^\+(?:get|post|put|patch|delete|head|options|all)\.ts$/
const MIDDLEWARE_FILE = '+middleware.ts'

function walkDir(dir: string, callback: (filePath: string) => void): void {
  if (!fs.existsSync(dir)) return

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue
      walkDir(path.join(dir, entry.name), callback)
    } else if (entry.isFile()) {
      callback(path.join(dir, entry.name))
    }
  }
}

function collectMiddlewareFiles(serverDir: string, subDir: string): string[] {
  const chainPaths = getMiddlewareChainPaths(subDir)
  return chainPaths
    .map(rel => path.join(serverDir, rel))
    .filter(abs => fs.existsSync(abs))
}

function scanRoutesDir(serverDir: string, subDir: string, prefix: string): RouteEntry[] {
  const dir = path.join(serverDir, subDir)
  const routes: RouteEntry[] = []

  walkDir(dir, (filePath) => {
    const relative = path.relative(dir, filePath)
    const basename = path.basename(filePath)

    if (!METHOD_FILE_RE.test(basename)) return

    const method = fileNameToMethod(basename)
    const routePath = filePathToRoutePath(relative, prefix)
    const relativeDir = path.dirname(relative)
    const middlewareSubDir = relativeDir === '.' ? subDir : `${subDir}/${relativeDir}`
    const middlewares = collectMiddlewareFiles(serverDir, middlewareSubDir)

    routes.push({ method, path: routePath, moduleId: filePath, middlewares })
  })

  return sortRoutesBySpecificity(routes)
}

function extractHandlerNames(filePath: string): string[] {
  const src = fs.readFileSync(filePath, 'utf-8')
  const defStart = src.search(/export\s+default\s+\{/)
  if (defStart === -1) return []

  const openBrace = src.indexOf('{', defStart)
  const names: string[] = []
  let depth = 0

  // Walk character by character tracking brace depth.
  // Only capture identifier keys at depth === 1 (direct children of export default {}).
  for (let i = openBrace; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{' || ch === '(') { depth++; continue }
    if (ch === '}' || ch === ')') { depth--; if (depth === 0) break; continue }
    if (depth !== 1) continue
    // At depth 1, try to match an identifier key
    const keyMatch = src.slice(i).match(/^(\w+)\s*[,:]/)
    if (keyMatch) {
      names.push(keyMatch[1])
      i += keyMatch[1].length - 1
    }
  }

  return names
}

function scanHandlersDir(serverDir: string): HandlerEntry | null {
  const indexPath = path.join(serverDir, 'handlers', 'index.ts')
  if (!fs.existsSync(indexPath)) return null
  return { moduleId: indexPath, names: extractHandlerNames(indexPath) }
}

export function scanServerDir(serverDir: string, apiPrefix: string): RouteManifest {
  const apiRoutes = scanRoutesDir(serverDir, 'api', apiPrefix)
  const customRoutes = scanRoutesDir(serverDir, 'routes', '')
  const handlers = scanHandlersDir(serverDir)

  return { apiRoutes, customRoutes, handlers }
}
