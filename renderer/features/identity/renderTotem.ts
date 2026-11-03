import type { IdentitySpec, TotemZone } from '@core/identity'

/**
 * Canvas 2D renderer for pixel totems. It knows nothing about identity
 * generation or onboarding: it samples an {@link IdentitySpec} into a
 * mirrored pixel grid and paints cells. Sampling is a pure exported
 * function so symmetry/assembly can be unit-tested without a canvas.
 *
 * Inspired by the Mirror Pixel Totem blueprint tool: four-way symmetric
 * zones (ellipse/rect/diamond) filled with gradient bands, rings, checker,
 * Bayer dither or hashed noise, over a dark ground with a vignette.
 */

export interface TotemFrame {
  /** CSS-pixel size of the (square) canvas backing store to draw into. */
  width: number
  height: number
  /** 0..1 assembly/reveal: cells appear in deterministic centre-out order. */
  progress?: number
  /** 0..1 subtle pulse phase (0 = rest). One finite swell, never a loop here. */
  pulse?: number
}

/** Bayer 8x8 ordered-dither matrix, values 0..63 (as in the reference tool). */
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
] as const

/** Deterministic 0..1 hash of (x, y, salt) — the reference tool's cell hash. */
export function cellHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function insideZone(zone: TotemZone, u: number, v: number): boolean {
  const dx = (u - zone.cx) / Math.max(zone.rx, 0.001)
  const dy = (v - zone.cy) / Math.max(zone.ry, 0.001)
  if (zone.shape === 'ellipse') return dx * dx + dy * dy <= 1
  if (zone.shape === 'rect') return Math.abs(dx) <= 1 && Math.abs(dy) <= 1
  return Math.abs(dx) + Math.abs(dy) <= 1
}

function zoneColor(spec: IdentitySpec, zone: TotemZone, ix: number, iy: number, u: number, v: number): string {
  const colors = spec.palette.colors
  let pickA: boolean
  switch (zone.pattern) {
    case 'rings': {
      const d = Math.hypot(u - zone.cx, v - zone.cy)
      pickA = Math.floor(d * zone.k * 4) % 2 === 0
      break
    }
    case 'bands':
      pickA = Math.floor(v * spec.bands * zone.k * 0.5) % 2 === 0
      break
    case 'checker':
      pickA = (ix + iy) % 2 === 0
      break
    case 'dither':
      pickA = BAYER8[iy % 8]![ix % 8]! / 64 < 0.35 + 0.3 * cellHash(ix, iy, zone.id + spec.seed)
      break
    default: // noise
      pickA = cellHash(ix, iy, zone.id + spec.seed) < 0.5
  }
  return colors[pickA ? zone.a : zone.b]!
}

export interface SampledCell {
  color: string
  /** 0..1 assembly order: the cell appears once frame progress passes this. */
  rank: number
}

/**
 * Colour + reveal rank for one grid cell. Coordinates are folded into the
 * first quadrant before sampling, which is what makes the totem mirrored:
 * sample(x, y) === sample(mirrored x, mirrored y) by construction.
 */
export function sampleTotemCell(spec: IdentitySpec, gx: number, gy: number): SampledCell {
  const cols = spec.cols
  const fx = gx < cols / 2 ? gx : cols - 1 - gx
  const fy = spec.symmetry === 'both' ? (gy < cols / 2 ? gy : cols - 1 - gy) : gy
  const half = cols / 2
  const u = (fx + 0.5) / half
  const v = spec.symmetry === 'both' ? (fy + 0.5) / half : (fy + 0.5) / cols

  // Topmost (last-drawn) zone wins, as in the reference render loop.
  let color = spec.palette.colors[0]
  for (let i = spec.zones.length - 1; i >= 0; i--) {
    const zone = spec.zones[i]!
    if (insideZone(zone, u, v)) {
      color = zoneColor(spec, zone, fx, fy, u, v)
      break
    }
  }

  // Assembly order: bottom-up, like a totem stacking, with a hashed stagger
  // (from the folded coords, so mirrored cells share a rank) so it accretes
  // organically instead of sweeping in clean rows.
  const fromBottom = 1 - (gy + 0.5) / cols
  const rank = Math.min(1, fromBottom * 0.62 + cellHash(fx, fy, spec.seed ^ 0x9e3779b9) * 0.38)
  return { color, rank }
}

function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `rgb(${r},${g},${b})`
}

/**
 * Paint one frame. Stateless and allocation-light (one fillRect per cell,
 * ~24x24), so callers may animate by calling it per rAF for a short,
 * finite tween — and must not call it in a perpetual loop.
 */
export function drawPixelTotem(ctx: CanvasRenderingContext2D, spec: IdentitySpec, frame: TotemFrame): void {
  const { width, height } = frame
  const progress = Math.min(1, Math.max(0, frame.progress ?? 1))
  const pulse = Math.min(1, Math.max(0, frame.pulse ?? 0))
  const cols = spec.cols
  const cellW = width / cols
  const cellH = height / cols

  ctx.fillStyle = spec.palette.colors[0]
  ctx.fillRect(0, 0, width, height)

  const inset = pulse * Math.min(cellW, cellH) * 0.18
  for (let gy = 0; gy < cols; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cell = sampleTotemCell(spec, gx, gy)
      if (cell.rank > progress) continue
      // Vignette: darken toward the corners of the full (unfolded) grid.
      const du = gx / (cols - 1) - 0.5
      const dv = gy / (cols - 1) - 0.5
      const edge = Math.min(1, (du * du + dv * dv) * 2)
      const factor = (1 - spec.vignette * 0.45 * edge) * (1 + pulse * 0.12)
      ctx.fillStyle = shade(cell.color, Math.min(factor, 1))
      ctx.fillRect(gx * cellW + inset / 2, gy * cellH + inset / 2, Math.max(0.5, cellW - inset), Math.max(0.5, cellH - inset))
    }
  }
}
