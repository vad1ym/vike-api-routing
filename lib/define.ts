import type { ApiContext, RouteHandler, MiddlewareFn } from './types.js'

export interface DefineRouteOptions<P extends Record<string, string> = Record<string, string>> {
  handler: RouteHandler<P>
  middlewares?: MiddlewareFn[]
}

export interface DefineRouteResult<P extends Record<string, string> = Record<string, string>> {
  __type: 'defineRoute'
  handler: RouteHandler<P>
  middlewares: MiddlewareFn[]
}

export function defineRoute<P extends Record<string, string> = Record<string, string>>(
  options: DefineRouteOptions<P>,
): DefineRouteResult<P> {
  return {
    __type: 'defineRoute',
    handler: options.handler,
    middlewares: options.middlewares ?? [],
  }
}

export function isDefineRoute(value: unknown): value is DefineRouteResult {
  return typeof value === 'object' && value !== null && (value as DefineRouteResult).__type === 'defineRoute'
}
