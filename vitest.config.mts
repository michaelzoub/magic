import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'shared'),
      '@core': resolve(import.meta.dirname, 'core'),
      '@agent': resolve(import.meta.dirname, 'agent'),
      '@': resolve(import.meta.dirname, 'renderer')
    }
  },
  test: { include: ['**/*.test.ts'] }
})
