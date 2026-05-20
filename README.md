# vike-api-router

> [!WARNING]
> **Proof of concept — partially works, not well tested.** Core features (file-based routes, middleware, proxy) are functional and used in real projects. Advanced features (`defineRoute`, `defineProxyRoute`, SSR/client handler unification) are experimental and may have edge cases. API may change. Validate behavior against your own setup before relying on it.

File-based API routing for [Vike](https://vike.dev). Define your server endpoints by creating files — no manual route registration needed.

Works with any server framework supported by [universal-middleware](https://github.com/nicolo-ribaudo/universal-middleware): Hono, h3, Express, and more.

---

## File Structure

```
server/
  api/          → HTTP endpoints with /api/ prefix
  routes/       → HTTP endpoints without prefix (robots.txt, sitemaps, etc.)
  handlers.ts   → RPC handlers, callable from client code directly
```

### File naming

| File | Route |
|------|-------|
| `server/api/get.ts` | `GET /api` |
| `server/api/users/get.ts` | `GET /api/users` |
| `server/api/users/post.ts` | `POST /api/users` |
| `server/api/users/all.ts` | any method → `/api/users` |
| `server/api/users/@id/get.ts` | `GET /api/users/:id` |
| `server/api/users/@id/delete.ts` | `DELETE /api/users/:id` |
| `server/api/files/@...rest/get.ts` | `GET /api/files/*` |
| `server/api/(auth)/sign-in/post.ts` | `POST /api/sign-in` |
| `server/routes/robots.txt/get.ts` | `GET /robots.txt` |

**Segment conventions:**
- `@id` → `:id` (dynamic param)
- `@...rest` → `*` (wildcard)
- `(group)` → ignored in the URL path, useful for organization
- Regular folder names → literal path segments

> No `+` prefix needed — files are named directly (`get.ts`, `post.ts`, `middleware.ts`). This avoids conflicts with Vike's own `+` file conventions.

---

## Route Handlers

Each `get.ts`, `post.ts`, etc. exports a default function:

```ts
// server/api/users/@id/get.ts
import type { ApiContext } from 'vike-api-router'

export default async function({ params, req }: ApiContext<{ id: string }>) {
  return { id: params.id, name: 'Alice' }
}
```

**Return values:**
- `Response` → passed through as-is
- plain object → serialized as `JSON` with status `200`
- `null` / `undefined` → `204 No Content`

---

## Middleware

Create a `middleware.ts` file in any directory. It applies **cumulatively** to all routes in that directory and all subdirectories.

```ts
// server/api/middleware.ts — runs for ALL /api/* routes
import type { MiddlewareFn } from 'vike-api-router'

const middleware: MiddlewareFn = async (req, next) => {
  console.log(`${req.method} ${new URL(req.url).pathname}`)
  return next()
}

export default middleware
```

```ts
// server/api/users/middleware.ts — runs only for /api/users/* (stacks on top)
import type { MiddlewareFn } from 'vike-api-router'

const middleware: MiddlewareFn = async (req, next) => {
  if (!req.headers.get('x-api-key')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return next()
}

export default middleware
```

Middleware chain for `GET /api/users/1`:
1. `server/api/middleware.ts`
2. `server/api/users/middleware.ts`
3. `server/api/users/@id/get.ts` (route handler)

---

## RPC Handlers

Create `server/handlers.ts` and export a default object mapping handler names to objects with async methods.

```ts
// server/handlers.ts
export default {
  userHandler: {
    async getUser(id: string) {
      return db.users.find(id)
    },
    async createUser(data: { name: string }) {
      return db.users.create(data)
    },
  },
}
```

Import from `vike-api-router/handlers` in any page, component, or data hook — the same import works in both SSR and the browser:

```ts
import { userHandler } from 'vike-api-router/handlers'

const user = await userHandler.getUser('123')
```

- **SSR** — calls the handler function directly, no HTTP round-trip
- **Browser** — makes a `POST /_rpc/userHandler/getUser` request under the hood

TypeScript types are automatically generated into `handlers.d.ts` at your project root when the Vite dev server starts. No manual declaration file needed.

---

## Route as Handler — `defineRoute`

Use `defineRoute` to declare a route that is also callable as a handler from client code.

```ts
// server/api/users/@id/put.ts
import { defineRoute } from 'vike-api-router'
import type { ApiContext } from 'vike-api-router'

export const updateUser = defineRoute({
  async handler({ params, req }: ApiContext<{ id: string }>) {
    const body = await req.json()
    return db.users.update(params.id, body)
  },
})
```

```ts
// Client or +data.ts — same import, works in SSR and browser
import { updateUser } from 'vike-api-router/handlers'

await updateUser({ params: { id: '42' }, body: { name: 'Alice' } })
```

- **SSR** — calls the handler function directly, no HTTP round-trip
- **Browser** — makes a real `PUT /api/users/42` request

The named export (`updateUser`) is the handler name. Only one named `defineRoute` export is allowed per route file — a second one throws an error at scan time.

TypeScript types for `updateUser` are auto-generated into `handlers.d.ts` alongside regular handler types.

---

## Proxy

Import from `vike-api-router/proxy`.

### `proxyRoute` — HTTP proxy endpoint

Returns a `RouteHandler` that forwards all requests to an upstream target. Use as the default export of a `+all.ts` file.

```ts
// server/api/github/@...path/all.ts
import { proxyRoute } from 'vike-api-router/proxy'

export default proxyRoute({
  target: 'https://api.github.com',

  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  },
})
```

`GET /api/github/repos/foo/bar` → `GET https://api.github.com/repos/foo/bar`

Method, query string, and body are forwarded automatically. The upstream `Response` is returned as-is.

**Options:**

```ts
type ProxyRouteOptions = {
  target: string | URL

  // Extra headers to add (static or dynamic)
  headers?: HeadersInit | ((ctx: ApiContext) => HeadersInit | Promise<HeadersInit>)

  // Which incoming headers to forward. Default: ['accept', 'accept-language', 'content-type', 'user-agent']
  forwardHeaders?: boolean | string[]

  // Headers to always strip. Default: ['host', 'connection', 'content-length']
  stripHeaders?: string[]

  // Override the forwarded path
  rewritePath?: (ctx: ApiContext) => string

  // Override the full upstream URL
  rewriteUrl?: (url: URL, ctx: ApiContext) => URL | Promise<URL>

  // Intercept/modify the outgoing request (return Response to short-circuit)
  onRequest?: (request: Request, ctx: ApiContext) => Request | Response | Promise<Request | Response>

  // Intercept/modify the upstream response
  onResponse?: (response: Response, ctx: ApiContext) => Response | Promise<Response>
}
```

---

### `proxyHandler` — server-side HTTP client

Returns a typed HTTP client for use inside server handler files. Handles JSON serialization, query params, and throws `ProxyError` on non-2xx responses.

```ts
// server/handlers.ts
import { proxyHandler } from 'vike-api-router/proxy'

const github = proxyHandler({
  target: 'https://api.github.com',
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
})

export async function getRepo(owner: string, repo: string) {
  return github.get(`/repos/${owner}/${repo}`)
}
```

**Methods:** `get`, `post`, `put`, `patch`, `delete`, `request(method, path, options?)`

**Request options:**

```ts
type RequestOptions = {
  query?: Record<string, unknown>   // serialized to URLSearchParams
  body?: unknown                    // JSON.stringify'd, sets content-type automatically
  headers?: HeadersInit
  signal?: AbortSignal
}
```

**Options:**

```ts
type ProxyHandlerOptions = {
  target: string | URL
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  fetch?: typeof fetch
  onRequest?: (request: Request) => Request | Promise<Request>
  onResponse?: (response: Response) => Response | Promise<Response>
}
```

**Error handling:**

```ts
import { ProxyError } from 'vike-api-router/proxy'

try {
  await github.get('/repos/missing')
} catch (error) {
  if (error instanceof ProxyError) {
    console.log(error.status)   // HTTP status code
    console.log(error.data)     // parsed response body
  }
}
```

- `204` → returns `undefined`
- non-2xx → throws `ProxyError`

---

## Setup

### 1. Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vike from 'vike/plugin'
import { vikeApiRouter } from 'vike-api-router/plugin'

export default defineConfig({
  plugins: [
    vikeApiRouter(), // must come before vike()
    vike(),
  ],
})
```

**Plugin options:**

```ts
vikeApiRouter({
  serverDir: 'server',  // default
  apiPrefix: '/api',    // default
  rpcPrefix: '/_rpc',   // default
})
```

### 2. Server entry

#### Hono

```ts
// +server.ts
import { Hono } from 'hono'
import vike from '@vikejs/hono'
import { vikeApiRouterMiddleware } from 'vike-api-router'

const app = new Hono()

vike(app, [vikeApiRouterMiddleware])

export default app
```

#### h3

```ts
// +server.ts
import { createApp, toWebHandler } from 'h3'
import vike from '@vikejs/h3'
import { vikeApiRouterMiddleware } from 'vike-api-router'

const app = createApp()

vike(app, [vikeApiRouterMiddleware])

export default { fetch: toWebHandler(app) }
```

---

## How It Works

1. **Vite plugin** scans `server/` at startup and on file changes, generates virtual modules (`virtual:vike-api-router/routes`, `virtual:vike-api-router/handlers`).
2. **`vikeApiRouterMiddleware`** is a [universal-middleware](https://github.com/nicolo-ribaudo/universal-middleware) compatible function — it works with any framework adapter (`@vikejs/hono`, `@vikejs/h3`, etc.).
3. On each request, the middleware checks RPC paths first (`/_rpc/*`), then matches against the route manifest.
4. Middleware chains are built statically per route (root → leaf) with no runtime overhead per request.

---

## Status

| Feature | Status |
|---------|--------|
| `get/post/put/patch/delete/head/options.ts` | ✅ |
| `all.ts` (any method) | ✅ |
| `middleware.ts` (cumulative) | ✅ |
| Dynamic segments `@id` | ✅ |
| Wildcard segments `@...rest` | ✅ |
| `server/routes/` (no prefix) | ✅ |
| RPC handlers (`server/handlers.ts`) | ✅ |
| Client import (`vike-api-router/handlers`) | ✅ |
| HMR (hot reload on file add/remove) | ✅ |
| TypeScript | ✅ |
| Hono | ✅ |
| h3 | 🚧 untested |
| Express | 🚧 untested |
