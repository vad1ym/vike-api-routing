import path from 'node:path'

const METHOD_FILES = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'])

/**
 * Convert a filesystem segment like `@id` or `@...rest` to a Hono route param.
 * Regular segments are returned as-is.
 */
export function segmentToHono(segment: string): string {
  if (segment.startsWith('@...')) return '*'
  if (segment.startsWith('@')) return `:${segment.slice(1)}`
  return segment
}

/**
 * Convert a file path relative to the server directory into a Hono route path.
 *
 * Examples:
 *   api/users/@id/+get.ts   → /api/users/:id
 *   api/+get.ts             → /api
 *   routes/robots.txt/+get.ts → /robots.txt
 */
export function filePathToRoutePath(relativePath: string, prefix: string): string {
  // Normalize separators
  const normalized = relativePath.split(path.sep).join('/')

  // Remove the +method.ts filename
  const dir = normalized.replace(/\/?\+[a-z]+\.ts$/, '')

  // Split into segments and convert each
  const segments = dir.split('/').filter(Boolean)
  const converted = segments.map(segmentToHono)

  const routePath = '/' + converted.join('/')

  // For prefix-based routes (api/), prepend the prefix
  // For routes/, no prefix
  if (prefix) {
    return prefix + (routePath === '/' ? '' : routePath)
  }
  return routePath
}

/**
 * Extract the HTTP method from a +method.ts filename.
 * Returns uppercase method or 'ALL' for +all.ts.
 */
export function fileNameToMethod(filename: string): string {
  const base = path.basename(filename, '.ts').replace('+', '').toLowerCase()
  if (!METHOD_FILES.has(base)) throw new Error(`Unknown method file: ${filename}`)
  return base === 'all' ? 'ALL' : base.toUpperCase()
}

/**
 * Return a numeric specificity score for route sorting.
 * Higher = more specific = register first.
 *
 * Static > Dynamic (:id) > Wildcard (*)
 */
export function routeSpecificity(routePath: string): number {
  const segments = routePath.split('/').filter(Boolean)
  let score = 0
  for (const seg of segments) {
    if (seg === '*') score -= 100
    else if (seg.startsWith(':')) score -= 1
    else score += 10
  }
  return score
}

/**
 * Sort routes by specificity: most specific first.
 */
export function sortRoutesBySpecificity<T extends { path: string }>(routes: T[]): T[] {
  return [...routes].sort((a, b) => routeSpecificity(b.path) - routeSpecificity(a.path))
}

/**
 * Given a directory path (relative to serverDir), return all ancestor +middleware.ts paths
 * from root to the directory (inclusive), in order root → leaf.
 *
 * Example for `api/users/@id`:
 *   ['api/+middleware.ts', 'api/users/+middleware.ts', 'api/users/@id/+middleware.ts']
 *   (only those that actually exist are included — caller filters)
 */
export function getMiddlewareChainPaths(relativeDir: string): string[] {
  // Normalize
  const parts = relativeDir.split('/').filter(Boolean)
  const chain: string[] = []

  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    chain.push(`${current}/+middleware.ts`)
  }

  return chain
}
