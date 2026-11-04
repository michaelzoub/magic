import type { OnboardingData } from '@core/onboarding/types'
import { createIdentitySpec, deriveIdentitySeed, hashParts } from './seed'
import type { IdentitySeed, IdentitySpec } from './types'

/**
 * Map onboarding answers (the user/agent choices collected by the wizard)
 * to identity inputs. This is the one place that knows the answer shape;
 * generation (seed.ts) and rendering stay answer-agnostic.
 *
 * Canonicalisation matters: areas/sites are sorted and de-duplicated so
 * re-ordering a selection does not mint a new identity, while changing any
 * actual choice (name, description, an area, a goal, a site) does.
 */
export type IdentityPartId = 'name' | 'description' | 'areas' | 'goals' | 'sites'

export interface IdentityPart {
  id: IdentityPartId
  label: string
  /** Canonical seed part, e.g. "areas:Coding,Work". */
  part: string
  /** Human-readable value(s) behind the part, for the influence view. */
  summary: string
}

/** Structured seed parts: the decisions that feed the identity, with display summaries. */
export function identityPartEntriesFromOnboarding(data: Readonly<OnboardingData>): IdentityPart[] {
  const welcome =
    typeof data.welcome === 'object' && data.welcome !== null ? (data.welcome as Record<string, unknown>) : {}
  const name = typeof welcome.name === 'string' ? welcome.name : typeof data.name === 'string' ? data.name : ''
  const description =
    typeof welcome.description === 'string'
      ? welcome.description
      : typeof data.description === 'string'
        ? data.description
        : ''

  const rawSelected = (data.goals as { selected?: unknown } | undefined)?.selected
  const areas: string[] = []
  const goals: string[] = []
  if (Array.isArray(rawSelected)) {
    for (const s of rawSelected) {
      if (typeof s === 'string') areas.push(s)
      else if (typeof s === 'object' && s !== null) {
        const { name: n, goal: g } = s as Record<string, unknown>
        if (typeof n === 'string' && n.trim()) areas.push(n.trim())
        if (typeof g === 'string' && g.trim()) goals.push(g.trim())
      }
    }
  } else if (typeof data.goal === 'string' && data.goal.trim()) {
    goals.push(data.goal.trim())
  }

  const sites = new Set<string>()
  if (typeof data.sites === 'object' && data.sites !== null) {
    for (const entry of Object.values(data.sites as Record<string, unknown>)) {
      const list = Array.isArray(entry) ? entry : (entry as { sites?: unknown } | null)?.sites
      if (Array.isArray(list)) {
        for (const s of list) if (typeof s === 'string' && s.trim()) sites.add(s.trim().toLowerCase())
      }
    }
  }

  const areaList = [...new Set(areas)].sort()
  const goalList = goals.sort()
  const siteList = [...sites].sort()
  return [
    { id: 'name', label: 'Your name', part: `name:${name.trim()}`, summary: name.trim() },
    { id: 'description', label: 'Your description', part: `description:${description.trim()}`, summary: description.trim() },
    { id: 'areas', label: 'Areas you picked', part: `areas:${areaList.join(',')}`, summary: areaList.join(', ') },
    { id: 'goals', label: 'Goals you set', part: `goals:${goalList.join(',')}`, summary: goalList.join(', ') },
    { id: 'sites', label: 'Example sites', part: `sites:${siteList.join(',')}`, summary: siteList.join(', ') }
  ]
}

export function identityPartsFromOnboarding(data: Readonly<OnboardingData>): string[] {
  return identityPartEntriesFromOnboarding(data).map((e) => e.part)
}

/** Persisted seed for a completed (or in-progress) onboarding data set. */
export function identitySeedFromOnboarding(data: Readonly<OnboardingData>): IdentitySeed {
  return deriveIdentitySeed(identityPartsFromOnboarding(data))
}

/**
 * Totem spec for onboarding answers. Uses a neutral fallback while nothing
 * has been answered yet, so the preview always has something to assemble;
 * every real answer then evolves seed → palette → zone layout.
 */
export function identitySpecFromOnboarding(data: Readonly<OnboardingData>): IdentitySpec {
  const parts = identityPartsFromOnboarding(data)
  const answered = parts.some((p) => p.split(':').slice(1).join(':').trim().length > 0)
  return createIdentitySpec(answered ? deriveIdentitySeed(parts) : 'v1.00000000')
}

/** Deterministic per-profile fallback for profiles saved before identities existed. */
export function identitySeedForProfile(profile: { displayName: string; goal: string; createdAt: number }): IdentitySeed {
  return deriveIdentitySeed([`profile:${profile.displayName}`, `goal:${profile.goal}`, `created:${profile.createdAt}`])
}

export { hashParts }
