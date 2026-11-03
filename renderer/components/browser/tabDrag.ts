/**
 * Slot a dragged tab belongs in, Chrome-style: the tab swaps with a
 * neighbour once its centre crosses that neighbour's centre — i.e. once it
 * has travelled half a slot past its own centre. Derived purely from the
 * dragged tab's own displacement (never the raw pointer position, which
 * varies with where inside the tab the user grabbed it), so the swap point
 * is the same no matter where the tab was grabbed and can't oscillate:
 * crossing back requires travelling the same half slot in reverse.
 */
export function dragTarget(from: number, dx: number, step: number, count: number): number {
  if (step <= 0) return from
  return Math.min(Math.max(from + Math.round(dx / step), 0), count - 1)
}
