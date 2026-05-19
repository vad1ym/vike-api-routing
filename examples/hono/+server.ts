import { Hono } from 'hono'
import vike from '@vikejs/hono'
import { vikeApiRouterMiddleware } from 'vike-api-router'

const app = new Hono()

vike(app, [vikeApiRouterMiddleware])

export default app
