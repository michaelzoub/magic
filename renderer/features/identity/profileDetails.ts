import type { CompletedOnboarding } from '@shared/onboarding'

/** One focus area and the goal the user set for it (goal may be ''). */
export interface ProfileGoal {
  name: string
  goal: string
}

export interface ProfileSiteGroup {
  area: string
  sites: string[]
}

/** Scannable, display-ready shape of the stored profile details. */
export interface ProfileDetails {
  /** Focus areas / interests, in stored order, de-duplicated. */
  areas: string[]
  goals: ProfileGoal[]
  sitesByArea: ProfileSiteGroup[]
  /** Every example site, flattened and de-duplicated (case-insensitive). */
  sites: string[]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Undo `composeGoalWithSites` (core/onboarding/profile.ts) for display: the
 * stored goal text has its example sites concatenated in ("… For Work, sites
 * include gmail.com."), but the dialog lists sites separately, so the suffix
 * would only duplicate them. User-edited goal texts don't match the exact
 * composed suffix and are left untouched.
 */
export function stripComposedSites(goal: string, area: string): string {
  const suffix = new RegExp(`\\s*For ${escapeRegExp(area)}, sites include .+\\.$`)
  return goal.replace(suffix, '').trim()
}

/** Split a comma/line-separated sites field into clean, de-duplicated sites. */
export function parseSitesInput(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s.toLowerCase())) return false
      seen.add(s.toLowerCase())
      return true
    })
}

/**
 * Read the profile details out of the stored settings (the `goals` / `sites`
 * settings seeded at onboarding — see buildCompleteOnboardingInput), falling
 * back to the singular profile goal for profiles saved before those settings
 * existed. Identity inputs / the totem seed are deliberately not read here:
 * editing these details must never change the generated identity.
 */
export function profileDetails(completed: CompletedOnboarding | null): ProfileDetails {
  const settings = completed?.settings
  const goals: ProfileGoal[] = []
  if (Array.isArray(settings?.goals)) {
    for (const entry of settings.goals as { name?: unknown; goal?: unknown }[]) {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
      if (!name) continue
      const rawGoal = typeof entry?.goal === 'string' ? entry.goal.trim() : ''
      goals.push({ name, goal: stripComposedSites(rawGoal, name) })
    }
  }
  if (goals.length === 0 && completed?.profile.goal.trim()) {
    goals.push({ name: '', goal: completed.profile.goal.trim() })
  }

  const sitesByArea: ProfileSiteGroup[] = []
  const rawSites = settings?.sites
  if (typeof rawSites === 'object' && rawSites !== null && !Array.isArray(rawSites)) {
    for (const [area, list] of Object.entries(rawSites as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const sites = parseSitesInput(list.filter((s): s is string => typeof s === 'string').join(','))
      if (sites.length > 0) sitesByArea.push({ area: area.trim(), sites })
    }
  }
  // Areas that only have sites (no goal row) still count as focus areas.
  for (const group of sitesByArea) {
    if (group.area && !goals.some((g) => g.name.toLowerCase() === group.area.toLowerCase())) {
      goals.push({ name: group.area, goal: '' })
    }
  }

  const areas: string[] = []
  for (const g of goals) {
    if (g.name && !areas.some((a) => a.toLowerCase() === g.name.toLowerCase())) areas.push(g.name)
  }
  return { areas, goals, sitesByArea, sites: parseSitesInput(sitesByArea.flatMap((g) => g.sites).join(',')) }
}
