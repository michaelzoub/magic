import type { BrowserEngine } from '@shared/engine'
import type { LoginImporter } from '@shared/import'
import type { OverlayHost, ShellOverlay } from '@shared/overlay'
import { createMemoryEngine } from './memory-engine'

declare global {
  interface Window {
    engine?: BrowserEngine
    overlay?: ShellOverlay
    overlayHost?: OverlayHost
    importer?: LoginImporter
    platform?: string
  }
}

/** Native engine when running inside the shell; in-memory fallback for plain-browser UI work. */
export const engine: BrowserEngine = window.engine ?? createMemoryEngine()
