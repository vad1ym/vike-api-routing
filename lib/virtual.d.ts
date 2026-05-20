declare module 'virtual:vike-api-router/handlers-client' {
  export const handlers: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>
}

declare module 'virtual:vike-api-router/middleware' {
  import type { UniversalMiddleware } from '@universal-middleware/core'
  export const vikeApiRouterMiddleware: UniversalMiddleware
}
