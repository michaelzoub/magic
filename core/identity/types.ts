/**
 * Procedural identity ("pixel totem") data models. Pure data — the seed and
 * the spec derived from it are the whole identity; rendering (Canvas 2D)
 * lives in renderer/features/identity and consumes only an IdentitySpec.
 */

/** Versioned, human-inspectable seed persisted per profile, e.g. "v1.8f3ac201". */
export type IdentitySeed = string

export type TotemShape = 'ellipse' | 'rect' | 'diamond'
export type TotemPattern = 'bands' | 'rings' | 'checker' | 'dither' | 'noise'

export interface TotemZone {
  /** Centre / radii in folded quadrant space: 0..1 on each axis. */
  cx: number
  cy: number
  rx: number
  ry: number
  shape: TotemShape
  pattern: TotemPattern
  /** Indexes into IdentitySpec.palette. Never equal. */
  a: number
  b: number
  /** Bands/rings frequency for patterned fills. */
  k: number
  id: number
}

/** Five-role palette inspired by the Mirror Pixel Totem blueprint defaults. */
export interface TotemPalette {
  name: string
  /** [dark, accent, accent2, accent3, light] */
  colors: readonly [string, string, string, string, string]
}

export interface IdentitySpec {
  version: 1
  /** Numeric seed the spec was generated from (parse of IdentitySeed). */
  seed: number
  palette: TotemPalette
  /** Grid resolution (cells per side). The totem is square. */
  cols: number
  /** Four-way mirror (blueprint default) or left/right only. */
  symmetry: 'both' | 'x'
  /** Gradient-band count + 0..1 edge darkening, as in the reference tool. */
  bands: number
  vignette: number
  zones: readonly TotemZone[]
}
