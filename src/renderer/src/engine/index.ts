import type { BrowserEngine } from '@shared/engine'
import { createMemoryEngine } from './memory-engine'

declare global {
  interface Window {
    engine?: BrowserEngine
    platform?: string
  }
}

/** Native engine when running inside the shell; in-memory fallback for plain-browser UI work. */
export const engine: BrowserEngine = window.engine ?? createMemoryEngine()
