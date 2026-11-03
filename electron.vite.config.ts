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
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'renderer/index.html'),
          overlay: resolve(__dirname, 'renderer/overlay.html')
        }
      }
    },
    resolve: { alias: { ...shared, '@': resolve(__dirname, 'renderer') } },
    // MAGIC_RENDERER_PORT lets parallel workspaces (each with its own dev
    // server) avoid colliding on the default port.
    server: { port: Number(process.env.MAGIC_RENDERER_PORT ?? 5174), strictPort: true },
    plugins: [preact()]
  }
})
