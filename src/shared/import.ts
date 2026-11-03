/**
 * Browser login import contract.
 *
 * "Login data" here means cookies: the session tokens that keep you signed
 * in. Importing them from a Chromium browser makes those sites signed-in
 * here without re-entering passwords. Saved passwords themselves are not
 * imported (there is no password store in this app to receive them).
 */

export const IMPORT_IPC = {
  detect: 'import:detect',
  importLogins: 'import:logins'
} as const

export interface DetectedSource {
  /** Stable id, e.g. 'chrome'. */
  id: string
  label: string
  /** Profile names with a cookie database, e.g. ['Default', 'Profile 1']. */
  profiles: string[]
}

export interface LoginImportResult {
  sourceId: string
  label: string
  profiles: number
  /** Cookies found in the source profile(s). */
  found: number
  imported: number
  /** Expired or undecryptable cookies skipped over. */
  skipped: number
  /** Cookies Electron rejected (e.g. invalid domain/path). */
  failed: number
  error?: string
}

export interface LoginImporter {
  detect(): Promise<DetectedSource[]>
  importLogins(sourceId: string): Promise<LoginImportResult>
}
