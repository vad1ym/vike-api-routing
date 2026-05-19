# vike-api-router

> ⚠️ **Work in Progress / Proof of Concept**
> This library is in early experimental stage. APIs may change at any time. Not recommended for production use.

File-based API routing for [Vike](https://vike.dev). Define your server endpoints by creating files — no manual route registration needed.

Works with any server framework supported by [universal-middleware](https://github.com/nicolo-ribaudo/universal-middleware): Hono, h3, Express, and more.

---

## File Structure

```
server/
  api/          → HTTP endpoints with /api/ prefix
  routes/       → HTTP endpoints without prefix (robots.txt, sitemaps, etc.)
  handlers/     → RPC handlers, callable from client code directly
```

### File naming

| File | Route |
|------|-------|
| `server/api/+get.ts` | `GET /api` |
| `server/api/users/+get.ts` | `GET /api/users` |
| `server/api/users/+post.ts` | `POST /api/users` |
| `server/api/users/+all.ts` | any method → `/api/users` |
| `server/api/users/@id/+get.ts` | `GET /api/users/:id` |
| `server/api/users/@id/+delete.ts` | `DELETE /api/users/:id` |
| `server/api/files/@...rest/+get.ts` | `GET /api/files/*` |
| `server/api/(auth)/sign-in/+post.ts` | `POST /api/sign-in` |
| `server/routes/robots.txt/+get.ts` | `GET /robots.txt` |

**Segment conventions:**
- `@id` → `:id` (dynamic param)
- `@...rest` → `*` (wildcard)
- `(group)` → ignored in the URL path, useful for organization
- Regular folder names → literal path segments

---

## Route Handlers

Each `+get.ts`, `+post.ts`, etc. exports a default function:

```ts
// server/api/users/@id/+get.ts
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

Create a `+middleware.ts` file in any directory. It applies **cumulatively** to all routes in that directory and all subdirectories.

```ts
// server/api/+middleware.ts — runs for ALL /api/* routes
import type { MiddlewareFn } from 'vike-api-router'

const middleware: MiddlewareFn = async (req, next) => {
  console.log(`${req.method} ${new URL(req.url).pathname}`)
  return next()
}

export default middleware
```

```ts
// server/api/users/+middleware.ts — runs only for /api/users/* (stacks on top)
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
1. `server/api/+middleware.ts`
2. `server/api/users/+middleware.ts`
3. `server/api/users/@id/+get.ts` (route handler)

---

## RPC Handlers

Files in `server/handlers/` export functions that can be called from client code. Under the hood they become `POST /_rpc/<name>/<fn>` endpoints — no separate endpoint URL needed in your code.

```ts
// server/handlers/userHandler.ts
export async function getUser(id: string) {
  return db.users.find(id)
}

export async function createUser(data: { name: string }) {
  return db.users.create(data)
}
```

```ts
// Client (any page or component)
import { userHandler } from 'vike-api-router/handlers'

const user = await userHandler.getUser('123')
const users = await userHandler.listUsers()
```

To get TypeScript types for handler functions, add a declaration file to your project root:

```ts
// handlers.d.ts
import type * as _userHandler from './server/handlers/userHandler'

declare module 'vike-api-router/handlers' {
  export const userHandler: typeof _userHandler
}
```

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
| `+get/post/put/patch/delete/head/options.ts` | ✅ |
| `+all.ts` (any method) | ✅ |
| `+middleware.ts` (cumulative) | ✅ |
| Dynamic segments `@id` | ✅ |
| Wildcard segments `@...rest` | ✅ |
| `server/routes/` (no prefix) | ✅ |
| RPC handlers (`server/handlers/`) | ✅ |
| Client import (`vike-api-router/handlers`) | ✅ |
| HMR (hot reload on file add/remove) | ✅ |
| TypeScript | ✅ |
| Hono | ✅ |
| h3 | 🚧 untested |
| Express | 🚧 untested |
