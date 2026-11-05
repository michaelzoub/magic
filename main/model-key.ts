/**
 * The Meta Model API key, as the main process owns it.
 *
 * Resolution order: a `MODEL_API_KEY` already in the environment (shell
 * export, or the repo's `.env` in development) wins and is read-only from
 * the app; otherwise the key saved from Settings is decrypted and placed
 * in `process.env`, where both the drift inference client and the spawned
 * Eve server (which inherits main's env) pick it up.
 */
import { safeStorage } from 'electron'
import type { ModelKeyStatus } from '@shared/model-key'

const SETTING = 'modelApiKey'

/** Minimal settings store (SqliteWorkspaceStore satisfies it). */
export interface SettingsStore {
  getSetting(key: string): unknown
  setSetting(key: string, value: unknown): void
}

interface StoredKey {
  /** base64; `safeStorage`-encrypted unless `plain` (no OS keychain available). */
  data: string
  plain?: boolean
}

export class ModelKeyStore {
  private readonly envKey: string | undefined

  constructor(private settings: () => SettingsStore) {
    this.envKey = process.env.MODEL_API_KEY?.trim() || undefined
  }

  /** Apply the saved key to `process.env` at startup (no-op when the env already has one). */
  load(): void {
    if (this.envKey) return
    const key = this.readStored()
    if (key) process.env.MODEL_API_KEY = key
  }

  status(): ModelKeyStatus {
    const key = process.env.MODEL_API_KEY?.trim()
    if (!key) return { configured: false, source: null, hint: null }
    return { configured: true, source: this.envKey ? 'env' : 'app', hint: key.slice(-4) }
  }

  set(key: string): ModelKeyStatus {
    const trimmed = key.trim()
    if (!trimmed) throw new Error('Paste a key first.')
    if (/\s/.test(trimmed)) throw new Error('That key contains spaces. Copy it again from the dashboard.')
    if (this.envKey) throw new Error('MODEL_API_KEY is set in the environment, which takes precedence. Remove it to manage the key here.')
    const stored: StoredKey = safeStorage.isEncryptionAvailable()
      ? { data: safeStorage.encryptString(trimmed).toString('base64') }
      : { data: Buffer.from(trimmed, 'utf8').toString('base64'), plain: true }
    this.settings().setSetting(SETTING, stored)
    process.env.MODEL_API_KEY = trimmed
    return this.status()
  }

  clear(): ModelKeyStatus {
    if (this.envKey) throw new Error('MODEL_API_KEY is set in the environment. Remove it there.')
    this.settings().setSetting(SETTING, null)
    delete process.env.MODEL_API_KEY
    return this.status()
  }

  private readStored(): string | null {
    try {
      const stored = this.settings().getSetting(SETTING) as StoredKey | null | undefined
      if (!stored || typeof stored.data !== 'string') return null
      const bytes = Buffer.from(stored.data, 'base64')
      return (stored.plain ? bytes.toString('utf8') : safeStorage.decryptString(bytes)).trim() || null
    } catch {
      // Unreadable (e.g. keychain reset): treat as unset so Settings can replace it.
      return null
    }
  }
}
