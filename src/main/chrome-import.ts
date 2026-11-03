import { execFile } from 'node:child_process'
import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CookiesSetDetails, Session } from 'electron'
import type { DetectedSource, LoginImportResult } from '@shared/import'

const run = promisify(execFile)

/**
 * Chromium-family browsers on macOS. Each keeps cookies in an SQLite DB per
 * profile and encrypts values with a key whose password lives in the macOS
 * Keychain under the given service name. Adding a browser is one entry here.
 */
const SOURCES = [
  { id: 'chrome', label: 'Chrome', dir: 'Google/Chrome', keychainService: 'Chrome Safe Storage' },
  { id: 'chromium', label: 'Chromium', dir: 'Chromium', keychainService: 'Chromium Safe Storage' },
  { id: 'brave', label: 'Brave', dir: 'BraveSoftware/Brave-Browser', keychainService: 'Brave Safe Storage' },
  { id: 'edge', label: 'Microsoft Edge', dir: 'Microsoft Edge', keychainService: 'Microsoft Edge Safe Storage' },
  { id: 'arc', label: 'Arc', dir: 'Arc/User Data', keychainService: 'Arc Safe Storage' }
] as const

type Source = (typeof SOURCES)[number]

interface CookieRow {
  host_key: string
  name: string
  value: string
  /** hex(encrypted_value) from SQLite. */
  enc: string
  path: string
  expires_utc: number
  is_secure: number
  is_httponly: number
  has_expires: number
  samesite: number
}

function profileDirs(source: Source): { name: string; db: string }[] {
  const root = join(homedir(), 'Library', 'Application Support', source.dir)
  if (!existsSync(root)) return []
  const profiles: { name: string; db: string }[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const rel of ['Network/Cookies', 'Cookies']) {
      const db = join(root, entry.name, rel)
      if (existsSync(db)) profiles.push({ name: entry.name, db })
    }
  }
  return profiles
}

export function detectSources(): DetectedSource[] {
  return SOURCES.flatMap((s) => {
    const profiles = profileDirs(s).map((p) => p.name)
    return profiles.length ? [{ id: s.id, label: s.label, profiles }] : []
  })
}

/** Chrome timestamps are microseconds since 1601-01-01; Electron wants Unix seconds. */
export function chromeTimeToUnixSeconds(expiresUtc: number): number {
  return Math.floor(expiresUtc / 1_000_000 - 11_644_473_600)
}

export function cookieUrl(row: Pick<CookieRow, 'host_key' | 'path' | 'is_secure'>): string {
  const host = row.host_key.replace(/^\./, '')
  return `${row.is_secure ? 'https' : 'http'}://${host}${row.path || '/'}`
}

const SAME_SITE: Record<number, CookiesSetDetails['sameSite']> = {
  [-1]: 'unspecified',
  0: 'lax',
  1: 'strict',
  2: 'no_restriction'
}

/** OSCrypt key derivation used by every Chromium browser on macOS. */
export function deriveKey(safeStoragePassword: string): Buffer {
  return pbkdf2Sync(safeStoragePassword, 'saltysalt', 1003, 16, 'sha1')
}

/**
 * Decrypt a v10/v11 cookie value (AES-128-CBC, IV = 16 spaces). Newer Chrome
 * prefixes the plaintext with SHA-256(host_key) to bind the cookie to its
 * domain; strip it when present. Returns null when undecryptable.
 */
export function decryptCookieValue(encrypted: Buffer, key: Buffer, hostKey: string): string | null {
  const prefix = encrypted.subarray(0, 3).toString('latin1')
  if (prefix !== 'v10' && prefix !== 'v11') return null
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
    const plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
    const hostHash = createHash('sha256').update(hostKey).digest()
    const body = plain.length > 32 && plain.subarray(0, 32).equals(hostHash) ? plain.subarray(32) : plain
    return body.toString('utf8')
  } catch {
    return null
  }
}

export function toCookieDetails(row: CookieRow, value: string, nowSeconds = Date.now() / 1000): CookiesSetDetails | null {
  const expirationDate = row.has_expires && row.expires_utc > 0 ? chromeTimeToUnixSeconds(row.expires_utc) : undefined
  if (expirationDate !== undefined && expirationDate <= nowSeconds) return null
  const sameSite = SAME_SITE[row.samesite] ?? 'unspecified'
  return {
    url: cookieUrl(row),
    name: row.name,
    value,
    domain: row.host_key,
    path: row.path || '/',
    secure: !!row.is_secure,
    httpOnly: !!row.is_httponly,
    ...(expirationDate !== undefined ? { expirationDate } : {}),
    // Chromium requires Secure for SameSite=None; degrade instead of failing.
    sameSite: sameSite === 'no_restriction' && !row.is_secure ? 'lax' : sameSite
  }
}

async function readCookieRows(dbPath: string): Promise<CookieRow[]> {
  // Chrome holds the DB open (and may lock it): copy it, plus WAL sidecars.
  const dir = mkdtempSync(join(tmpdir(), 'magic-cookie-import-'))
  try {
    const copy = join(dir, 'Cookies')
    copyFileSync(dbPath, copy)
    for (const suffix of ['-wal', '-shm']) if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, copy + suffix)
    const { stdout } = await run('sqlite3', [
      '-readonly', '-json', copy,
      'SELECT host_key, name, value, hex(encrypted_value) AS enc, path, expires_utc, is_secure, is_httponly, has_expires, samesite FROM cookies'
    ], { maxBuffer: 256 * 1024 * 1024 })
    return JSON.parse(stdout || '[]') as CookieRow[]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function safeStoragePassword(service: string): Promise<string> {
  // Triggers the macOS Keychain consent prompt for the source browser's key.
  const { stdout } = await run('security', ['find-generic-password', '-s', service, '-w'])
  return stdout.trim()
}

/** Import every cookie from every profile of one source into `target`. */
export async function importLogins(target: Session, sourceId: string): Promise<LoginImportResult> {
  const source = SOURCES.find((s) => s.id === sourceId)
  const base: LoginImportResult = {
    sourceId, label: source?.label ?? sourceId, profiles: 0, found: 0, imported: 0, skipped: 0, failed: 0
  }
  if (process.platform !== 'darwin') return { ...base, error: 'Login import is only supported on macOS for now.' }
  if (!source) return { ...base, error: `Unknown browser: ${sourceId}` }
  const profiles = profileDirs(source)
  if (!profiles.length) return { ...base, error: `${source.label} profile not found.` }

  let key: Buffer
  try {
    key = deriveKey(await safeStoragePassword(source.keychainService))
  } catch {
    return { ...base, error: `Could not read ${source.label}'s key from Keychain (access denied?).` }
  }

  const result = { ...base, profiles: profiles.length }
  for (const profile of profiles) {
    let rows: CookieRow[]
    try {
      rows = await readCookieRows(profile.db)
    } catch {
      result.failed++
      continue
    }
    result.found += rows.length
    for (const row of rows) {
      const value = row.value || decryptCookieValue(Buffer.from(row.enc, 'hex'), key, row.host_key)
      const details = value ? toCookieDetails(row, value) : null
      if (!details) {
        result.skipped++
        continue
      }
      try {
        await target.cookies.set(details)
        result.imported++
      } catch {
        result.failed++
      }
    }
  }
  await target.cookies.flushStore().catch(() => {})
  return result
}
