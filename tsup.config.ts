import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'lib/index.ts',
    plugin: 'lib/plugin/index.ts',
    client: 'lib/client.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  dts: false,
  clean: true,
  external: ['vite', 'node:fs', 'node:path'],
})
