import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import preact from '@preact/preset-vite'

const shared = {
  '@shared': resolve(__dirname, 'shared'),
  '@core': resolve(__dirname, 'core'),
  '@agent': resolve(__dirname, 'agent')
}

export default defineConfig({
  main: {
    build: { lib: { entry: resolve(__dirname, 'main/index.ts') } },
    resolve: { alias: shared }
  },
  preload: {
    build: { lib: { entry: resolve(__dirname, 'preload/index.ts') } },
    resolve: { alias: shared }
  },
  renderer: {
    root: resolve(__dirname, 'renderer'),
    build: { rollupOptions: { input: resolve(__dirname, 'renderer/index.html') } },
    resolve: { alias: { ...shared, '@': resolve(__dirname, 'renderer') } },
    server: { port: 5174, strictPort: true },
    plugins: [preact()]
  }
})
