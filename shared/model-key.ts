/**
 * Model API key contract between renderer, preload, and main.
 *
 * The key never crosses back to a renderer: main keeps it (encrypted at
 * rest with the OS keychain via `safeStorage`) and only reports whether
 * one is configured, where it came from, and its last four characters.
 */

/** `env`: from the shell or a dev `.env` (read-only in the app). `app`: saved from Settings. */
export type ModelKeySource = 'env' | 'app'

export interface ModelKeyStatus {
  configured: boolean
  source: ModelKeySource | null
  /** Last four characters, for recognising which key is in use. */
  hint: string | null
}

export const MODEL_KEY_IPC = {
  status: 'model-key:status',
  set: 'model-key:set',
  clear: 'model-key:clear'
} as const

export interface ModelKeyBridge {
  status(): Promise<ModelKeyStatus>
  /** Validates, stores, and applies a key; the agent restarts with it. */
  set(key: string): Promise<ModelKeyStatus>
  clear(): Promise<ModelKeyStatus>
}

/** Where users create a key; shown in Settings and in the missing-key message. */
export const MODEL_KEY_URL = 'https://dev.meta.ai'
