import { DatabaseSync } from 'node:sqlite'
import type {
  PersistedTabSet,
  WorkspaceRecord,
  WorkspaceSnapshot,
  WorkspaceSwitchRecord,
  RecordSwitchInput
} from '@shared/workspaces'

type UpsertInput = Parameters<import('@shared/workspaces').WorkspacePersistence['upsertWorkspace']>[0]

interface WorkspaceRow {
  id: string
  name: string
  description: string
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
  description TEXT NOT NULL DEFAULT '',
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
`

const toRecord = (r: WorkspaceRow): WorkspaceRecord => ({
  id: r.id,
  name: r.name,
  description: r.description,
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
 * - `workspaces`: every workspace ever selected or created, with description
 * - `workspace_switches`: append-only before → after history of every switch
 * - `workspace_tabs` + `app_state`: per-workspace open tabs and the active id
 */
export class SqliteWorkspaceStore {
  private readonly db: DatabaseSync

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    this.db.exec(SCHEMA)
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
        `INSERT INTO workspaces (id, name, name_key, description, icon, listed, sort_order, created_at, updated_at, last_switched_at)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces)), ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, name_key = excluded.name_key,
           description = excluded.description, icon = excluded.icon,
           listed = excluded.listed, updated_at = excluded.updated_at,
           last_switched_at = COALESCE(excluded.last_switched_at, workspaces.last_switched_at)`
      )
      .run(
        input.id,
        input.name.trim(),
        input.name.trim().toLowerCase(),
        input.description ?? '',
        input.icon || 'layers',
        input.listed ? 1 : 0,
        input.sortOrder ?? null,
        input.createdAt ?? now,
        now,
        input.lastSwitchedAt ?? null
      )
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
