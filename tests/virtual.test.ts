import { describe, it, expect } from 'vitest'
import { generateHandlersDts } from '../lib/plugin/virtual.js'
import type { HandlerEntry } from '../lib/plugin/scanner.js'

describe('generateHandlersDts', () => {
  it('generates empty declaration when no handler', () => {
    const result = generateHandlersDts(null)
    expect(result).toContain(`declare module 'vike-api-router/handlers'`)
    expect(result).not.toContain('export')
  })

  it('re-exports default from handler index', () => {
    const handler: HandlerEntry = { moduleId: '/project/server/handlers/index.ts' }
    const result = generateHandlersDts(handler)
    expect(result).toContain(`export { default } from "/project/server/handlers/index.ts"`)
  })
})
