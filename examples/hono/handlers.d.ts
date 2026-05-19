import type * as _userHandler from './server/handlers/userHandler'

declare module 'vike-api-router/handlers' {
  export const userHandler: typeof _userHandler
}
