import type { MiddlewareFn } from 'vike-api-router'

// Global middleware — runs for ALL /api/* routes
const middleware: MiddlewareFn = async (req, next) => {
  console.log(`[api] ${req.method} ${new URL(req.url).pathname}`)
  const res = await next()
  return res
}

export default middleware
