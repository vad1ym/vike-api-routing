import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'lib/index.ts',
    plugin: 'lib/plugin/index.ts',
    client: 'lib/client.ts',
    'config': 'lib/config.ts',
    'handlers': 'lib/handlers.ts',
    'proxy': 'lib/proxy.ts',
    'internal/routeAdapter': 'lib/middleware/routeAdapter.ts',
    'internal/rpcAdapter': 'lib/middleware/rpcAdapter.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  dts: false,
  clean: true,
  external: [
    'vite',
    'node:fs',
    'node:path',
    'node:os',
    /^virtual:/,
  ],
})
