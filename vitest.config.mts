import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@core': resolve(import.meta.dirname, 'src/core'),
      '@agent': resolve(import.meta.dirname, 'src/agent'),
      '@': resolve(import.meta.dirname, 'src/renderer')
    }
  },
  test: { include: ['src/**/*.test.ts'] }
})
