import type { ApiContext } from 'vike-api-router'

// ALL methods → /api/health
// Demonstrates +all.ts handling any HTTP method
export default function({ method }: ApiContext) {
  return { status: 'ok', method, timestamp: new Date().toISOString() }
}
