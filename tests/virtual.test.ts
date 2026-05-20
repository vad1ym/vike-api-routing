import { describe, it, expect } from 'vitest'
import { generateHandlersDts } from '../lib/plugin/virtual.js'
import type { HandlerEntry } from '../lib/plugin/scanner.js'

describe('generateHandlersDts', () => {
  it('generates empty declaration for no handlers', () => {
    const result = generateHandlersDts([])
    expect(result).toContain(`declare module 'vike-api-router/handlers'`)
    expect(result).not.toContain('export *')
  })

  it('re-exports each handler module', () => {
    const handlers: HandlerEntry[] = [
      { name: 'oladoctor', moduleId: '/project/server/handlers/oladoctor.ts' },
      { name: 'github', moduleId: '/project/server/handlers/github.ts' },
    ]
    const result = generateHandlersDts(handlers)
    expect(result).toContain(`export * from "/project/server/handlers/oladoctor.ts"`)
    expect(result).toContain(`export * from "/project/server/handlers/github.ts"`)
  })
})
