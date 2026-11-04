import type { CompletedOnboarding } from '@shared/onboarding'
import type { OnboardingData } from '@core/onboarding/types'
import { identityPartEntriesFromOnboarding } from './fromOnboarding'
import { createIdentitySpec, deriveIdentitySeed, hashParts } from './seed'
import type { IdentityPart, IdentityPartId } from './fromOnboarding'
import type { IdentitySeed, IdentitySpec, TotemPattern } from './types'

/**
 * Explainability for the identity: which onboarding decisions fed the seed,
 * and proof each one matters — a leave-one-out counterfactual spec (the
 * totem you would have gotten without that decision) computed through the
 * exact same seed → spec pipeline. No hand-waved attribution.
 */

export interface IdentityInfluence extends IdentityPart {
  /** Short hash of this decision alone, shown as its fingerprint in the seed mix. */
  fingerprint: string
  /** What generating without this decision would change. */
  counterfactual: {
    seed: IdentitySeed
    paletteName: string
    zoneCount: number
    symmetry: IdentitySpec['symmetry']
    paletteChanged: boolean
    layoutChanged: boolean
  }
}

export interface IdentityReport {
  /** The persisted seed that actually generates the shown totem. */
  seed: IdentitySeed
  spec: IdentitySpec
  influences: IdentityInfluence[]
  /** True when the persisted seed no longer matches today's answers (kept from first completion). */
  seedPreserved: boolean
}

const fingerprint = (part: string) => hashParts([part]).toString(16).padStart(8, '0').slice(0, 6)

export function buildIdentityReport(data: Readonly<OnboardingData>, persistedSeed?: IdentitySeed | null): IdentityReport {
  return buildReport(identityPartEntriesFromOnboarding(data), persistedSeed)
}

function buildReport(entries: IdentityPart[], persistedSeed?: IdentitySeed | null): IdentityReport {
  const derivedSeed = deriveIdentitySeed(entries.map((e) => e.part))
  const seed = persistedSeed ?? derivedSeed
  const spec = createIdentitySpec(seed)
  const parts = entries.map((e) => e.part)

  const influences = entries
    .filter((e) => e.summary.length > 0)
    .map((e): IdentityInfluence => {
      const without = parts.map((p, i) => (entries[i]!.id === e.id ? `${e.id}:` : p))
      const altSeed = deriveIdentitySeed(without)
      const alt = createIdentitySpec(altSeed)
      return {
        ...e,
        fingerprint: fingerprint(e.part),
        counterfactual: {
          seed: altSeed,
          paletteName: alt.palette.name,
          zoneCount: alt.zones.length,
          symmetry: alt.symmetry,
          paletteChanged: alt.palette.name !== spec.palette.name,
          layoutChanged: alt.zones.length !== spec.zones.length || alt.symmetry !== spec.symmetry
        }
      }
    })

  return { seed, spec, influences, seedPreserved: persistedSeed != null && persistedSeed !== derivedSeed }
}

/**
 * Rebuild the onboarding-answer shape from a stored profile + its seeded
 * settings (description / goals / sites are settings, see core/onboarding),
 * then explain the persisted identity against those decisions.
 */
const isIdentityPart = (v: unknown): v is IdentityPart => {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    ['name', 'description', 'areas', 'goals', 'sites'].includes(p.id as string) &&
    typeof p.label === 'string' && typeof p.part === 'string' && typeof p.summary === 'string'
  )
}

export function buildIdentityReportFromCompleted(completed: CompletedOnboarding): IdentityReport | null {
  const { profile, settings } = completed
  if (!profile.identitySeed) return null
  // Preferred: the canonical inputs stored at completion (see
  // buildCompleteOnboardingInput) — they reproduce the original seed
  // exactly, so the counterfactuals and preserved-seed check are accurate.
  if (Array.isArray(settings.identityInputs) && settings.identityInputs.every(isIdentityPart)) {
    return buildReport(settings.identityInputs as unknown as IdentityPart[], profile.identitySeed)
  }
  const goals = Array.isArray(settings.goals)
    ? (settings.goals as { name?: unknown; goal?: unknown }[]).map((g) => ({
        name: typeof g.name === 'string' ? g.name : '',
        goal: typeof g.goal === 'string' ? g.goal : ''
      }))
    : []
  const sites: Record<string, { sites: string[] }> = {}
  if (typeof settings.sites === 'object' && settings.sites !== null && !Array.isArray(settings.sites)) {
    for (const [area, list] of Object.entries(settings.sites as Record<string, unknown>)) {
      if (Array.isArray(list)) sites[area] = { sites: list.filter((s): s is string => typeof s === 'string') }
    }
  }
  const data: OnboardingData = {
    welcome: {
      name: profile.displayName,
      description: typeof settings.description === 'string' ? settings.description : ''
    },
    goals: { options: goals.map((g) => g.name), selected: goals },
    sites
  }
  // Legacy fallback (no stored inputs): the stored goals have sites
  // concatenated in, so a derived-seed comparison would be meaningless —
  // never claim the seed was preserved on this path.
  return { ...buildIdentityReport(data, profile.identitySeed), seedPreserved: false }
}

/**
 * Human-readable explanation of the totem for the profile view: the actual
 * onboarding answers that were combined to generate it, plus the visible
 * traits that combination produced (its palette, the fill patterns present
 * in its zones, and its mirroring). Deliberately free of seeds, hashes, and
 * grid details, and with no per-answer attribution — the generator mixes
 * every answer together before choosing any trait, so only the combined
 * effect can honestly be described.
 */
export interface IdentityExplanation {
  /** Palette name chosen for this totem, e.g. "Sunset temple". */
  paletteName: string
  /** Fill patterns actually present in the totem's zones, in first-appearance order. */
  patterns: string[]
  /** How the totem is mirrored, e.g. "mirrored side to side and top to bottom". */
  symmetry: string
  /** The answered onboarding decisions that were combined, with their values. */
  influences: { id: IdentityPartId; label: string; summary: string }[]
}

const PATTERN_LABELS: Record<TotemPattern, string> = {
  bands: 'bands',
  rings: 'rings',
  checker: 'checkerboard',
  dither: 'soft dithering',
  noise: 'speckled noise'
}

export function buildIdentityExplanation(completed: CompletedOnboarding): IdentityExplanation | null {
  const report = buildIdentityReportFromCompleted(completed)
  if (!report) return null
  const patterns: string[] = []
  for (const zone of report.spec.zones) {
    const label = PATTERN_LABELS[zone.pattern]
    if (!patterns.includes(label)) patterns.push(label)
  }
  return {
    paletteName: report.spec.palette.name,
    patterns,
    symmetry: report.spec.symmetry === 'both' ? 'mirrored side to side and top to bottom' : 'mirrored side to side',
    // Display text only: summaries persisted by earlier versions joined
    // goals with a decorative middle dot — normalise to a comma here so
    // stored profiles render the same as newly generated ones.
    influences: report.influences.map(({ id, label, summary }) => ({ id, label, summary: summary.replaceAll(' · ', ', ') }))
  }
}

export type { IdentityPartId }
