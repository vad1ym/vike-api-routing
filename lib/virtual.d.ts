declare module 'virtual:vike-api-router/handlers-client' {
  export const handlers: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>
}
