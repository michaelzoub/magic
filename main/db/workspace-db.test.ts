import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteWorkspaceStore } from './workspace-db'
import { createIdentitySpec } from '@core/identity'

let dir: string
let file: string

const ws = (id: string, name: string, goal = '') => ({
  id, name, goal, icon: 'layers', listed: false, lastSwitchedAt: null
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'magic-ws-db-'))
  file = join(dir, 'test.sqlite')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SqliteWorkspaceStore', () => {
  it('returns null before anything is saved, then round-trips workspaces with goals', () => {
    const store = new SqliteWorkspaceStore(file)
    expect(store.loadSnapshot()).toBeNull()
    store.upsertWorkspace(ws('work', 'Work', 'Get work projects done'))
    store.upsertWorkspace(ws('personal', 'Personal', 'Handle everyday browsing and errands'))
    const snap = store.loadSnapshot()!
    expect(snap.workspaces.map((w) => [w.id, w.goal])).toEqual([
      ['work', 'Get work projects done'],
      ['personal', 'Handle everyday browsing and errands']
    ])
    expect(snap.activeWorkspaceId).toBeNull()
    store.close()
  })

  it('migrates a pre-goal database, preserving description text as the goal', () => {
    const legacy = new DatabaseSync(file)
    legacy.exec(`CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'layers',
      listed INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_switched_at INTEGER
    )`)
    legacy
      .prepare('INSERT INTO workspaces (id, name, name_key, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('work', 'Work', 'work', 'Ship the v2 launch', 1, 1)
    legacy.close()

    const store = new SqliteWorkspaceStore(file)
    expect(store.loadSnapshot()!.workspaces[0]!.goal).toBe('Ship the v2 launch')
    store.upsertWorkspace(ws('work', 'Work', 'Ship the v3 launch'))
    expect(store.loadSnapshot()!.workspaces[0]!.goal).toBe('Ship the v3 launch')
    store.close()
  })

  it('updates in place on re-upsert instead of duplicating', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('work', 'Work', 'old'))
    store.upsertWorkspace(ws('work', 'Work', 'new goal'))
    expect(store.loadSnapshot()!.workspaces).toHaveLength(1)
    expect(store.loadSnapshot()!.workspaces[0]!.goal).toBe('new goal')
    store.close()
  })

  it('rejects duplicate names under a different id (unique name_key)', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('w1', 'Work'))
    expect(() => store.upsertWorkspace(ws('w2', ' work '))).toThrow()
    store.close()
  })

  it('records every switch as before → after, marks the target active/listed, and persists across reopen', () => {
    let store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('personal', 'Personal'))
    store.upsertWorkspace(ws('work', 'Work'))
    store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 100 })
    store.recordSwitch({ fromWorkspaceId: 'personal', toWorkspaceId: 'work', switchedAt: 200 })
    store.recordSwitch({ fromWorkspaceId: 'work', toWorkspaceId: 'personal', switchedAt: 300 })

    expect(store.listSwitches()).toEqual([
      { id: 3, fromWorkspaceId: 'work', toWorkspaceId: 'personal', switchedAt: 300 },
      { id: 2, fromWorkspaceId: 'personal', toWorkspaceId: 'work', switchedAt: 200 },
      { id: 1, fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 100 }
    ])
    const snap = store.loadSnapshot()!
    expect(snap.activeWorkspaceId).toBe('personal')
    expect(snap.listedIds).toEqual(['personal', 'work'])
    expect(snap.workspaces.find((w) => w.id === 'personal')!.lastSwitchedAt).toBe(300)
    store.close()

    store = new SqliteWorkspaceStore(file)
    expect(store.loadSnapshot()!.switches).toHaveLength(3)
    expect(store.loadSnapshot()!.activeWorkspaceId).toBe('personal')
    store.close()
  })

  it('does not record a switch to the already-active workspace, and rejects unknown targets', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('work', 'Work'))
    store.recordSwitch({ fromWorkspaceId: 'work', toWorkspaceId: 'work', switchedAt: 1 })
    expect(store.listSwitches()).toEqual([])
    expect(() => store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'nope', switchedAt: 1 })).toThrow(/No workspace/)
    store.close()
  })

  it('deletes a workspace with its tabs, clears a dangling active id, and rejects unknown ids', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('personal', 'Personal'))
    store.upsertWorkspace(ws('work', 'Work'))
    store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 1 })
    store.saveTabSet('personal', { tabs: [{ id: 't1', url: 'https://example.com/', title: 'Example' }], activeTabId: 't1' })

    store.deleteWorkspace('personal')
    const snap = store.loadSnapshot()!
    expect(snap.workspaces.map((w) => w.id)).toEqual(['work'])
    expect(snap.tabSets.personal).toBeUndefined()
    expect(snap.activeWorkspaceId).toBeNull()
    expect(() => store.deleteWorkspace('personal')).toThrow(/No workspace/)
    // The freed name can be reused right away.
    store.upsertWorkspace(ws('personal-2', 'Personal'))
    expect(store.loadSnapshot()!.workspaces.map((w) => w.id)).toEqual(['work', 'personal-2'])
    store.close()
  })

  it('saves the onboarding profile + initial settings atomically and persists across reopen', () => {
    let store = new SqliteWorkspaceStore(file)
    expect(store.loadOnboarding()).toBeNull()
    const done = store.completeOnboarding({
      profile: { displayName: 'Ada', goal: 'Focus' },
      settings: { defaultGoal: 'Focus', theme: 'dark' },
      completedAt: 1000
    })
    expect(done.profile).toEqual({
      displayName: 'Ada', goal: 'Focus', identitySeed: expect.stringMatching(/^v1\.[0-9a-f]{8}$/),
      onboardingCompletedAt: 1000, createdAt: 1000, updatedAt: 1000
    })
    expect(done.settings).toEqual({ defaultGoal: 'Focus', theme: 'dark' })
    store.close()

    store = new SqliteWorkspaceStore(file)
    expect(store.loadOnboarding()).toEqual(done)
    store.close()
  })

  it('re-running onboarding updates the profile but never clobbers existing settings or first completion', () => {
    const store = new SqliteWorkspaceStore(file)
    store.completeOnboarding({
      profile: { displayName: 'Ada', goal: 'Focus' },
      settings: { defaultGoal: 'Focus', theme: 'dark' },
      completedAt: 1000
    })
    const again = store.completeOnboarding({
      profile: { displayName: 'Ada Lovelace', goal: 'Research' },
      settings: { defaultGoal: 'Research', theme: 'light', extra: true },
      completedAt: 2000
    })
    expect(again.profile).toEqual({
      displayName: 'Ada Lovelace', goal: 'Research',
      identitySeed: expect.stringMatching(/^v1\.[0-9a-f]{8}$/),
      onboardingCompletedAt: 1000, createdAt: 1000, updatedAt: 2000
    })
    // theme/defaultGoal kept their seeded values; only the new key was added.
    expect(again.settings).toEqual({ defaultGoal: 'Focus', theme: 'dark', extra: true })
    expect(() => store.completeOnboarding({ profile: { displayName: ' ', goal: '' }, settings: {} })).toThrow(/display name/)
    store.close()
  })

  it('persists the identity seed across reopen and keeps the first seed on re-run', () => {
    let store = new SqliteWorkspaceStore(file)
    const done = store.completeOnboarding({
      profile: { displayName: 'Ada', goal: 'Focus', identitySeed: 'v1.00000008' },
      settings: {},
      completedAt: 1000
    })
    expect(done.profile.identitySeed).toBe('v1.00000008')
    const again = store.completeOnboarding({
      profile: { displayName: 'Ada', goal: 'Research', identitySeed: 'v1.00000009' },
      settings: {},
      completedAt: 2000
    })
    expect(again.profile.identitySeed).toBe('v1.00000008')
    store.close()

    store = new SqliteWorkspaceStore(file)
    expect(store.loadOnboarding()!.profile.identitySeed).toBe('v1.00000008')
    store.close()
  })

  it('migrates a pre-identity profile and backfills a stable seed on load', () => {
    const legacy = new DatabaseSync(file)
    legacy.exec(`CREATE TABLE user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1), display_name TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '', onboarding_completed_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`)
    legacy.prepare('INSERT INTO user_profile VALUES (1, ?, ?, ?, ?, ?)').run('Ada', 'Focus', 1000, 1000, 1000)
    legacy.close()

    const store = new SqliteWorkspaceStore(file)
    const first = store.loadOnboarding()!
    expect(first.profile.identitySeed).toMatch(/^v1\.[0-9a-f]{8}$/)
    expect(store.loadOnboarding()!.profile.identitySeed).toBe(first.profile.identitySeed)
    store.close()
  })

  it('updates the existing profile in place, preserving the identity, settings, and workspaces', () => {
    let store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('work', 'Work', 'Ship v2'))
    const done = store.completeOnboarding({
      profile: { displayName: 'Ada', goal: 'Focus', identitySeed: 'v1.00000008' },
      settings: { description: 'A builder.', theme: 'dark', identityInputs: [{ id: 'name' }] },
      completedAt: 1000
    })
    const totemBefore = createIdentitySpec(done.profile.identitySeed!)

    const updated = store.updateProfile({ displayName: '  Ada Lovelace ', description: '  A mathematician and builder. ' })
    expect(updated.profile.displayName).toBe('Ada Lovelace')
    expect(updated.settings.description).toBe('A mathematician and builder.')
    // Everything that defines the identity and the rest of the profile is untouched.
    expect(updated.profile.identitySeed).toBe('v1.00000008')
    expect(updated.profile.goal).toBe('Focus')
    expect(updated.profile.onboardingCompletedAt).toBe(1000)
    expect(updated.profile.createdAt).toBe(1000)
    expect(updated.profile.updatedAt).toBeGreaterThan(1000)
    expect(updated.settings.theme).toBe('dark')
    expect(updated.settings.identityInputs).toEqual([{ id: 'name' }])
    expect(createIdentitySpec(updated.profile.identitySeed!)).toEqual(totemBefore)
    expect(store.loadSnapshot()!.workspaces.map((w) => [w.id, w.goal])).toEqual([['work', 'Ship v2']])
    store.close()

    // The edit survives a restart (fresh store over the same file).
    store = new SqliteWorkspaceStore(file)
    const reopened = store.loadOnboarding()!
    expect(reopened.profile.displayName).toBe('Ada Lovelace')
    expect(reopened.settings.description).toBe('A mathematician and builder.')
    expect(reopened.profile.identitySeed).toBe('v1.00000008')
    expect(createIdentitySpec(reopened.profile.identitySeed!)).toEqual(totemBefore)
    store.close()
  })

  it('rejects profile updates with no name or no existing profile', () => {
    const store = new SqliteWorkspaceStore(file)
    expect(() => store.updateProfile({ displayName: 'Ada', description: '' })).toThrow(/No profile/)
    store.completeOnboarding({ profile: { displayName: 'Ada', goal: '' }, settings: {}, completedAt: 1000 })
    expect(() => store.updateProfile({ displayName: '  ', description: 'x' })).toThrow(/display name/)
    // A failed update leaves the stored profile untouched.
    expect(store.loadOnboarding()!.profile.displayName).toBe('Ada')
    store.close()
  })

  it('saves the outgoing workspace tabs with the switch and restores them on load', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('personal', 'Personal'))
    store.upsertWorkspace(ws('work', 'Work'))
    const tabs = {
      tabs: [
        { id: 't1', url: 'https://github.com/', title: 'GitHub' },
        { id: 't2', url: 'https://example.com/', title: 'Example', favicon: 'f.ico' }
      ],
      activeTabId: 't2'
    }
    store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 1 })
    store.recordSwitch({ fromWorkspaceId: 'personal', toWorkspaceId: 'work', switchedAt: 2, outgoingTabSet: tabs })
    expect(store.loadSnapshot()!.tabSets.personal).toEqual(tabs)

    store.saveTabSet('work', { tabs: [{ id: 't9', url: '', title: 'New Tab' }], activeTabId: 't9' })
    expect(store.loadSnapshot()!.tabSets.work).toEqual({ tabs: [{ id: 't9', url: '', title: 'New Tab' }], activeTabId: 't9' })
    expect(() => store.saveTabSet('nope', tabs)).toThrow(/No workspace/)
    store.close()
  })
})
