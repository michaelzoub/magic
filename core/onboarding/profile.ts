import type { CompleteOnboardingInput, InitialSettings, SettingValue } from '@shared/onboarding'
import { identityPartEntriesFromOnboarding, identitySeedFromOnboarding } from '@core/identity'
import type { OnboardingData } from './types'

/**
 * The actual goal text saved for a workspace: its goal with its example
 * sites concatenated in, e.g. "Ship v2. For Work, sites include
 * gmail.com, notion.so." Blank/duplicate sites are dropped.
 */
export function composeGoalWithSites(name: string, goal: string, sites: readonly string[]): string {
  const seen = new Set<string>()
  const clean = sites.flatMap((s) => {
    const site = s.trim()
    if (!site || seen.has(site.toLowerCase())) return []
    seen.add(site.toLowerCase())
    return [site]
  })
  const base = goal.trim()
  if (clean.length === 0) return base
  return `${base} For ${name.trim()}, sites include ${clean.join(', ')}.`
}

const isSettingValue = (v: unknown): v is SettingValue =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v) ||
  (Array.isArray(v) && v.every(isSettingValue)) ||
  (typeof v === 'object' && Object.values(v as Record<string, unknown>).every(isSettingValue))

/**
 * Map collected onboarding answers to the profile + initial settings saved
 * at completion. The first (`welcome`) step's name becomes the profile
 * display name and its one-sentence description is seeded as the
 * `description` setting; the goals step's first area goal becomes the
 * profile goal (and all its areas/goals the `goals` setting). Every other
 * JSON-serializable answer is seeded as an initial setting under its step
 * id, so new steps extend settings without changing the save path.
 * (Legacy flat `name`/`description` answers are still accepted.)
 */
export function buildCompleteOnboardingInput(
  data: Readonly<OnboardingData>,
  completedAt = Date.now()
): CompleteOnboardingInput {
  const welcome =
    typeof data.welcome === 'object' && data.welcome !== null ? (data.welcome as Record<string, unknown>) : {}
  const displayName =
    (typeof welcome.name === 'string' ? welcome.name : typeof data.name === 'string' ? data.name : '').trim()
  if (!displayName) throw new Error('Onboarding profile requires a name')
  const description =
    typeof welcome.description === 'string'
      ? welcome.description.trim()
      : typeof data.description === 'string'
        ? data.description.trim()
        : ''
  // Goals step: a multi-select of areas, each with its own goal. The first
  // area's goal becomes the (singular) profile goal; all of them are seeded
  // as the `goals` setting. A legacy flat `goal` string still works.
  const rawGoals = (data.goals as { selected?: unknown } | undefined)?.selected
  const goals = Array.isArray(rawGoals)
    ? rawGoals.flatMap((s) => {
        if (typeof s === 'string') return [{ name: s.trim(), goal: '' }]
        if (typeof s !== 'object' || s === null) return []
        const { name, goal: g } = s as Record<string, unknown>
        return typeof name === 'string' && name.trim()
          ? [{ name: name.trim(), goal: typeof g === 'string' ? g.trim() : '' }]
          : []
      })
    : []
  // Sites step: example websites per area (keyed by area name), concatenated
  // into each area's actual goal text above.
  const rawSites =
    typeof data.sites === 'object' && data.sites !== null ? (data.sites as Record<string, unknown>) : {}
  const sites: Record<string, string[]> = {}
  /** Goal text the user edited in step 3, per area — it wins over recomposing. */
  const editedGoalTexts: Record<string, string> = {}
  for (const [area, entry] of Object.entries(rawSites)) {
    // Current shape: { sites, goalText }; legacy shape: a bare site array.
    const list = Array.isArray(entry) ? entry : (entry as { sites?: unknown } | null)?.sites
    if (Array.isArray(list)) sites[area] = list.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
    const goalText = (entry as { goalText?: unknown } | null)?.goalText
    if (typeof goalText === 'string' && goalText.trim()) editedGoalTexts[area] = goalText.trim()
  }
  const goalsWithSites = goals.map((g) => ({
    name: g.name,
    goal: editedGoalTexts[g.name] ?? composeGoalWithSites(g.name, g.goal, sites[g.name] ?? [])
  }))
  const goal = goalsWithSites.find((g) => g.goal)?.goal ?? (typeof data.goal === 'string' ? data.goal : '')

  const settings: InitialSettings = { defaultGoal: goal }
  // Canonical identity inputs (the exact decisions mixed into the seed), so
  // the Settings influence view can explain the *original* choices — the
  // processed goals/sites settings below have sites concatenated in and
  // cannot reproduce them. Seed-only like every setting: first completion's
  // inputs are kept, matching the first-wins persisted seed.
  settings.identityInputs = identityPartEntriesFromOnboarding(data) as unknown as SettingValue
  if (description) settings.description = description
  if (Array.isArray(rawGoals)) settings.goals = goalsWithSites as SettingValue
  if (Object.keys(sites).length > 0) settings.sites = sites as SettingValue
  for (const [key, value] of Object.entries(data)) {
    if (['name', 'goal', 'goals', 'sites', 'welcome', 'description'].includes(key) || value === undefined) continue
    if (!isSettingValue(value)) throw new Error(`Onboarding answer "${key}" is not JSON-serializable`)
    settings[key] = value
  }
  // The identity seed is derived deterministically from the full answer set
  // (name, description, areas/goals, sites); the store keeps the first one
  // it persists, so this value only takes effect on first completion.
  return { profile: { displayName, goal, identitySeed: identitySeedFromOnboarding(data) }, settings, completedAt }
}
