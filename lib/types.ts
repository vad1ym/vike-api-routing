/**
 * Context passed to route handler functions.
 */
export interface ApiContext<P extends Record<string, string> = Record<string, string>> {
  /** Parsed route params, e.g. { id: '123' } */
  params: P
  /** Native Web Request object */
  req: Request
  /** HTTP method (uppercase) */
  method: string
  /** Escape hatch: raw framework context (Hono Context, h3 Event, etc.) */
  c?: unknown
}

/**
 * A route handler function — the default export of a +get.ts, +post.ts, etc. file.
 *
 * Return values:
 * - Response → passed through as-is
 * - plain object → serialized as JSON with 200
 * - null/undefined → 204 No Content
 */
export type RouteHandler<P extends Record<string, string> = Record<string, string>> = (
  ctx: ApiContext<P>,
) => Response | object | null | undefined | Promise<Response | object | null | undefined>

/**
 * A middleware function — the default export of a +middleware.ts file.
 *
 * Uses Web-standard (Request, next) → Response signature for framework portability.
 */
export type MiddlewareFn = (req: Request, next: () => Promise<Response>) => Promise<Response>
