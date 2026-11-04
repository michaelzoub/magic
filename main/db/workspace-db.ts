import { DatabaseSync } from 'node:sqlite'
import type {
  PersistedTabSet,
  WorkspaceRecord,
  WorkspaceSnapshot,
  WorkspaceSwitchRecord,
  RecordSwitchInput
} from '@shared/workspaces'
import type { CompletedOnboarding, CompleteOnboardingInput, InitialSettings, UpdateProfileInput, UserProfile } from '@shared/onboarding'
import { identitySeedForProfile } from '@core/identity'

type UpsertInput = Parameters<import('@shared/workspaces').WorkspacePersistence['upsertWorkspace']>[0]

interface WorkspaceRow {
  id: string
  name: string
  goal: string
  icon: string
  listed: number
  sort_order: number
  created_at: number
  updated_at: number
  last_switched_at: number | null
}

interface TabRow {
  workspace_id: string
  tab_id: string
  url: string
  title: string
  favicon: string | null
  is_active: number
}

interface SwitchRow {
  id: number
  from_workspace_id: string | null
  to_workspace_id: string
  switched_at: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  goal TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'layers',
  listed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_switched_at INTEGER
);
CREATE TABLE IF NOT EXISTS workspace_tabs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tab_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  favicon TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, tab_id)
);
CREATE TABLE IF NOT EXISTS workspace_switches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_workspace_id TEXT,
  to_workspace_id TEXT NOT NULL,
  switched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_switches_time ON workspace_switches(switched_at DESC);
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  identity_seed TEXT,
  onboarding_completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`

interface ProfileRow {
  display_name: string
  goal: string
  identity_seed: string | null
  onboarding_completed_at: number | null
  created_at: number
  updated_at: number
}

interface SettingRow {
  key: string
  value: string
}

const toRecord = (r: WorkspaceRow): WorkspaceRecord => ({
  id: r.id,
  name: r.name,
  goal: r.goal,
  icon: r.icon,
  listed: r.listed === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastSwitchedAt: r.last_switched_at
})

const toSwitch = (r: SwitchRow): WorkspaceSwitchRecord => ({
  id: r.id,
  fromWorkspaceId: r.from_workspace_id,
  toWorkspaceId: r.to_workspace_id,
  switchedAt: r.switched_at
})

/**
 * SQLite persistence for workspaces, built on Node's built-in `node:sqlite`
 * (no native dependency to rebuild for Electron). Synchronous by design —
 * writes are tiny and local — and wrapped in transactions so a switch and
 * its side effects (active workspace, listing, outgoing tabs) land atomically.
 *
 * Owns three facts:
 * - `workspaces`: every workspace ever selected or created, with goal
 * - `workspace_switches`: append-only before → after history of every switch
 * - `workspace_tabs` + `app_state`: per-workspace open tabs and the active id
 */
export class SqliteWorkspaceStore {
  private readonly db: DatabaseSync

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    this.db.exec(SCHEMA)
    this.migrateGoalColumn()
    this.migrateIdentityColumn()
  }

  /** Pre-identity databases have no seed column; add it (existing rows are backfilled on load). */
  private migrateIdentityColumn(): void {
    const columns = this.db.prepare('PRAGMA table_info(user_profile)').all() as unknown as { name: string }[]
    if (columns.length === 0 || columns.some((c) => c.name === 'identity_seed')) return
    this.db.exec('ALTER TABLE user_profile ADD COLUMN identity_seed TEXT')
  }

  /** Pre-goal databases stored the same text in `description`; rename it in place so existing values survive. */
  private migrateGoalColumn(): void {
    const columns = this.db.prepare('PRAGMA table_info(workspaces)').all() as unknown as { name: string }[]
    if (columns.some((c) => c.name === 'goal') || !columns.some((c) => c.name === 'description')) return
    this.db.exec('ALTER TABLE workspaces RENAME COLUMN description TO goal')
  }

  close(): void {
    this.db.close()
  }

  loadSnapshot(): WorkspaceSnapshot | null {
    const rows = this.db
      .prepare('SELECT * FROM workspaces ORDER BY sort_order ASC, created_at ASC')
      .all() as unknown as WorkspaceRow[]
    if (rows.length === 0) return null
    const tabSets: Record<string, PersistedTabSet> = {}
    const tabRows = this.db
      .prepare('SELECT * FROM workspace_tabs ORDER BY workspace_id, position ASC')
      .all() as unknown as TabRow[]
    for (const row of tabRows) {
      const set = (tabSets[row.workspace_id] ??= { tabs: [], activeTabId: null })
      set.tabs.push({ id: row.tab_id, url: row.url, title: row.title, ...(row.favicon ? { favicon: row.favicon } : {}) })
      if (row.is_active === 1) set.activeTabId = row.tab_id
    }
    return {
      workspaces: rows.map(toRecord),
      listedIds: rows.filter((r) => r.listed === 1).map((r) => r.id),
      activeWorkspaceId: this.getActiveId(),
      tabSets,
      switches: this.listSwitches()
    }
  }

  upsertWorkspace(input: UpsertInput): void {
    if (!input.id) throw new Error('Workspace id is required')
    if (!input.name?.trim()) throw new Error('Workspace name is required')
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO workspaces (id, name, name_key, goal, icon, listed, sort_order, created_at, updated_at, last_switched_at)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces)), ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, name_key = excluded.name_key,
           goal = excluded.goal, icon = excluded.icon,
           listed = excluded.listed, updated_at = excluded.updated_at,
           last_switched_at = COALESCE(excluded.last_switched_at, workspaces.last_switched_at)`
      )
      .run(
        input.id,
        input.name.trim(),
        input.name.trim().toLowerCase(),
        input.goal ?? '',
        input.icon || 'layers',
        input.listed ? 1 : 0,
        input.sortOrder ?? null,
        input.createdAt ?? now,
        now,
        input.lastSwitchedAt ?? null
      )
  }

  /** Delete a workspace and its saved tabs (FK cascade); clears the active id when it pointed at it. Switch history is kept. */
  deleteWorkspace(workspaceId: string): void {
    if (!workspaceId) throw new Error('Workspace id is required')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId)
      if (result.changes === 0) throw new Error(`No workspace with id ${workspaceId}`)
      if (this.getActiveId() === workspaceId) {
        this.db.prepare("DELETE FROM app_state WHERE key = 'active_workspace_id'").run()
      }
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  /**
   * Record one switch: append the before → after row, mark the target
   * listed + active, stamp its `last_switched_at`, and save the outgoing
   * workspace's live tabs — all in one transaction.
   */
  recordSwitch(input: RecordSwitchInput): void {
    if (!input.toWorkspaceId) throw new Error('Switch target workspace id is required')
    if (input.fromWorkspaceId === input.toWorkspaceId) return
    const target = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(input.toWorkspaceId)
    if (!target) throw new Error(`No workspace with id ${input.toWorkspaceId}`)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare('INSERT INTO workspace_switches (from_workspace_id, to_workspace_id, switched_at) VALUES (?, ?, ?)')
        .run(input.fromWorkspaceId, input.toWorkspaceId, input.switchedAt)
      this.db
        .prepare('UPDATE workspaces SET listed = 1, last_switched_at = ?, updated_at = ? WHERE id = ?')
        .run(input.switchedAt, input.switchedAt, input.toWorkspaceId)
      this.setActiveId(input.toWorkspaceId)
      if (input.fromWorkspaceId && input.outgoingTabSet) this.replaceTabSet(input.fromWorkspaceId, input.outgoingTabSet)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  /** Quit the active workspace: forget the active id (no workspace is set); workspaces and tabs stay. */
  clearActiveWorkspace(): void {
    this.db.prepare("DELETE FROM app_state WHERE key = 'active_workspace_id'").run()
  }

  saveTabSet(workspaceId: string, tabSet: PersistedTabSet): void {
    if (!this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) {
      throw new Error(`No workspace with id ${workspaceId}`)
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.replaceTabSet(workspaceId, tabSet)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  /**
   * Complete onboarding: upsert the singleton user profile and seed the
   * initial settings in one transaction. Settings are only seeded where
   * no value exists yet, so re-running onboarding updates the profile
   * without clobbering settings the user changed afterwards. The first
   * completion timestamp (and created_at) is preserved on re-runs.
   */
  completeOnboarding(input: CompleteOnboardingInput): CompletedOnboarding {
    const displayName = input.profile.displayName?.trim()
    if (!displayName) throw new Error('Profile display name is required')
    const completedAt = input.completedAt ?? Date.now()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `INSERT INTO user_profile (id, display_name, goal, identity_seed, onboarding_completed_at, created_at, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             display_name = excluded.display_name, goal = excluded.goal,
             identity_seed = COALESCE(user_profile.identity_seed, excluded.identity_seed),
             onboarding_completed_at = COALESCE(user_profile.onboarding_completed_at, excluded.onboarding_completed_at),
             updated_at = excluded.updated_at`
        )
        .run(displayName, input.profile.goal ?? '', input.profile.identitySeed ?? null, completedAt, completedAt, completedAt)
      const seedSetting = this.db.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO NOTHING`
      )
      for (const [key, value] of Object.entries(input.settings)) {
        seedSetting.run(key, JSON.stringify(value), completedAt)
      }
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    return this.loadOnboarding()!
  }

  /**
   * Update the existing singleton profile in place: the display name (on
   * `user_profile`) and the `description` setting change, in one
   * transaction; when provided, the `goals`/`sites` settings change too and
   * the profile goal follows the first goals entry (as at onboarding). The
   * identity seed, timestamps from onboarding, every other setting
   * (including the canonical identity inputs behind the totem), and all
   * workspaces are left untouched, so the totem and the rest of the app
   * state survive an edit unchanged.
   */
  updateProfile(input: UpdateProfileInput): CompletedOnboarding {
    const displayName = input.displayName?.trim()
    if (!displayName) throw new Error('Profile display name is required')
    const description = typeof input.description === 'string' ? input.description.trim() : ''
    // Sanitise the optional goals/sites the same way onboarding does:
    // trimmed, blanks dropped, sites de-duplicated case-insensitively.
    const goals = Array.isArray(input.goals)
      ? input.goals.flatMap((g) => {
          const name = typeof g?.name === 'string' ? g.name.trim() : ''
          return name ? [{ name, goal: typeof g?.goal === 'string' ? g.goal.trim() : '' }] : []
        })
      : undefined
    const sites =
      typeof input.sites === 'object' && input.sites !== null && !Array.isArray(input.sites)
        ? Object.fromEntries(
            Object.entries(input.sites).flatMap(([area, list]) => {
              const name = area.trim()
              if (!name || !Array.isArray(list)) return []
              const seen = new Set<string>()
              const clean = list.flatMap((s) => {
                const site = typeof s === 'string' ? s.trim() : ''
                if (!site || seen.has(site.toLowerCase())) return []
                seen.add(site.toLowerCase())
                return [site]
              })
              return clean.length > 0 ? [[name, clean] as const] : []
            })
          )
        : undefined
    const now = Date.now()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result =
        goals !== undefined
          ? this.db
              .prepare('UPDATE user_profile SET display_name = ?, goal = ?, updated_at = ? WHERE id = 1')
              .run(displayName, goals.find((g) => g.goal)?.goal ?? '', now)
          : this.db.prepare('UPDATE user_profile SET display_name = ?, updated_at = ? WHERE id = 1').run(displayName, now)
      if (result.changes === 0) throw new Error('No profile to update')
      const setSetting = this.db.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      setSetting.run('description', JSON.stringify(description), now)
      if (goals !== undefined) {
        setSetting.run('goals', JSON.stringify(goals), now)
        setSetting.run('defaultGoal', JSON.stringify(goals.find((g) => g.goal)?.goal ?? ''), now)
      }
      if (sites !== undefined) setSetting.run('sites', JSON.stringify(sites), now)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    return this.loadOnboarding()!
  }

  /** One app setting by key (JSON-decoded), or undefined when never set. */
  getSetting(key: string): unknown {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as unknown as { value: string } | undefined
    return row ? (JSON.parse(row.value) as unknown) : undefined
  }

  /** Upsert one app setting (stored JSON-encoded, like the onboarding settings). */
  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), Date.now())
  }

  loadOnboarding(): CompletedOnboarding | null {
    const row = this.db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as unknown as ProfileRow | undefined
    if (!row) return null
    // Backfill profiles saved before identities existed, deterministically
    // from the stored profile itself, and persist it so the identity is
    // stable from then on (not re-derived if the profile later changes).
    let identitySeed = row.identity_seed
    if (!identitySeed) {
      identitySeed = identitySeedForProfile({ displayName: row.display_name, goal: row.goal, createdAt: row.created_at })
      this.db.prepare('UPDATE user_profile SET identity_seed = ? WHERE id = 1 AND identity_seed IS NULL').run(identitySeed)
    }
    const profile: UserProfile = {
      displayName: row.display_name,
      goal: row.goal,
      identitySeed,
      onboardingCompletedAt: row.onboarding_completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
    const settings: InitialSettings = {}
    const rows = this.db.prepare('SELECT key, value FROM app_settings ORDER BY key').all() as unknown as SettingRow[]
    for (const s of rows) settings[s.key] = JSON.parse(s.value)
    return { profile, settings }
  }

  listSwitches(limit = 100): WorkspaceSwitchRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM workspace_switches ORDER BY switched_at DESC, id DESC LIMIT ?')
      .all(Math.max(0, Math.floor(limit))) as unknown as SwitchRow[]
    return rows.map(toSwitch)
  }

  private replaceTabSet(workspaceId: string, tabSet: PersistedTabSet): void {
    this.db.prepare('DELETE FROM workspace_tabs WHERE workspace_id = ?').run(workspaceId)
    const insert = this.db.prepare(
      'INSERT INTO workspace_tabs (workspace_id, tab_id, position, url, title, favicon, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    tabSet.tabs.forEach((tab, i) => {
      insert.run(workspaceId, tab.id, i, tab.url, tab.title, tab.favicon ?? null, tab.id === tabSet.activeTabId ? 1 : 0)
    })
  }

  private getActiveId(): string | null {
    const row = this.db.prepare("SELECT value FROM app_state WHERE key = 'active_workspace_id'").get() as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  private setActiveId(id: string): void {
    this.db
      .prepare(
        `INSERT INTO app_state (key, value) VALUES ('active_workspace_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(id)
  }
}
