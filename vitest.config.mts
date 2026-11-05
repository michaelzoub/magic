import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(import.meta.dirname, 'shared') },
      { find: '@core', replacement: resolve(import.meta.dirname, 'core') },
      { find: '@agent', replacement: resolve(import.meta.dirname, 'agent') },
      { find: '@', replacement: resolve(import.meta.dirname, 'renderer') },
      // The UI is Preact behind React imports (see tsconfig paths); the
      // renderer build gets this from @preact/preset-vite, tests need it here.
      { find: /^react\/jsx-(dev-)?runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react(-dom)?$/, replacement: 'preact/compat' }
    ]
  },
  test: { include: ['**/*.test.ts'] }
})
