import type { IdentitySeed, IdentitySpec, TotemPalette, TotemZone } from './types'

/**
 * Deterministic seed + spec generation. No Math.random, no Date, no I/O:
 * the same canonical parts always produce the same seed, and the same seed
 * always produces the same spec — across processes and restarts. The
 * persisted seed is therefore the only state the identity needs.
 */

const SEED_PREFIX = 'v1.'

/** cyrb53 string hash, returned as an unsigned 32-bit int. */
export function hashParts(parts: readonly string[]): number {
  const text = parts.map((p) => p.trim().toLowerCase()).join('\u001f')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h2 >>> 0) ^ (h1 >>> 0)) >>> 0
}

/**
 * Derive the persisted seed from canonical identity parts (name, areas,
 * sites, …). Empty input is refused so a seed always means something.
 */
export function deriveIdentitySeed(parts: readonly string[]): IdentitySeed {
  const clean = parts.map((p) => p.trim()).filter(Boolean)
  if (clean.length === 0) throw new Error('Identity seed requires at least one non-empty part')
  return SEED_PREFIX + hashParts(clean).toString(16).padStart(8, '0')
}

/** Numeric seed for the PRNG; accepts bare numbers and persisted strings. */
export function parseIdentitySeed(seed: IdentitySeed | number): number {
  if (typeof seed === 'number') return seed >>> 0
  const hex = seed.startsWith(SEED_PREFIX) ? seed.slice(SEED_PREFIX.length) : seed
  const n = Number.parseInt(hex, 16)
  if (!Number.isFinite(n)) throw new Error(`Invalid identity seed "${seed}"`)
  return n >>> 0
}

/** mulberry32: tiny deterministic PRNG, stable across JS engines. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Palettes from the reference tool's presets (dark/accent/accent2/accent3/
 * light), plus Magic-toned variants. Selection is seeded, not user-facing.
 */
export const TOTEM_PALETTES: readonly TotemPalette[] = [
  { name: 'Acid garden', colors: ['#220c24', '#ff5fc0', '#4dff8a', '#00d9a6', '#fbeff5'] },
  { name: 'Gameboy relic', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#e4f0b0'] },
  { name: 'Sunset temple', colors: ['#1a0b2e', '#ff4d6d', '#ffb703', '#fb8500', '#fff1d6'] },
  { name: 'Fine grid', colors: ['#0b1d3a', '#5bc0ff', '#ff7ad9', '#3a6ff0', '#f4f7ff'] },
  { name: 'Ultraviolet', colors: ['#12002f', '#b517ff', '#00e5ff', '#ffea00', '#f5f0ff'] },
  { name: 'Coral reef', colors: ['#062a33', '#ff6b6b', '#ffd93d', '#4ecdc4', '#fff8e7'] }
]

const SHAPES = ['ellipse', 'rect', 'diamond'] as const
const PATTERNS = ['bands', 'rings', 'checker', 'dither', 'noise'] as const
/** Colour pairs (palette indexes) the reference tool draws zones from. */
const PAIRS: readonly (readonly [number, number])[] = [
  [1, 2], [0, 4], [3, 2], [1, 0], [2, 0], [1, 4], [3, 1]
]

const range = (rng: () => number, min: number, max: number) => min + rng() * (max - min)
const int = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

/**
 * Build the full totem spec from a seed. Zone layout mirrors the reference
 * render: a few large zones plus smaller ones, each an ellipse/rect/diamond
 * in quadrant space with a banded/ring/checker/dither/noise fill in one of
 * the palette pairs. The renderer folds coordinates, so zones only need to
 * describe one quadrant.
 */
export function createIdentitySpec(seed: IdentitySeed | number): IdentitySpec {
  const numeric = parseIdentitySeed(seed)
  const rng = createRng(numeric)
  const palette = TOTEM_PALETTES[int(rng, 0, TOTEM_PALETTES.length - 1)]!
  const zoneCount = int(rng, 12, 20)
  const zones: TotemZone[] = []
  for (let i = 0; i < zoneCount; i++) {
    const big = i < 4
    const pair = PAIRS[int(rng, 0, PAIRS.length - 1)]!
    const flip = rng() < 0.5
    const a = flip ? pair[1] : pair[0]
    let b = flip ? pair[0] : pair[1]
    if (a === b) b = 0
    zones.push({
      cx: range(rng, 0, 0.9),
      cy: range(rng, 0, 0.95),
      rx: big ? range(rng, 0.35, 0.8) : range(rng, 0.1, 0.45),
      ry: big ? range(rng, 0.12, 0.3) : range(rng, 0.05, 0.25),
      shape: SHAPES[int(rng, 0, SHAPES.length - 1)]!,
      pattern: PATTERNS[int(rng, 0, PATTERNS.length - 1)]!,
      a,
      b,
      k: int(rng, 3, 9),
      id: i
    })
  }
  return {
    version: 1,
    seed: numeric,
    palette,
    cols: 24,
    symmetry: rng() < 0.85 ? 'both' : 'x',
    bands: int(rng, 3, 7),
    vignette: 0.8,
    zones
  }
}
