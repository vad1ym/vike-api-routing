import type { MiddlewareFn } from 'vike-api-router'

// Cumulative middleware — runs only for /api/users/* routes
// Stacks on top of the global /api/+middleware.ts
const middleware: MiddlewareFn = async (req, next) => {
  const authHeader = req.headers.get('x-api-key')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing x-api-key header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return next()
}

export default middleware
