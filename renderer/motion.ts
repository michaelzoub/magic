import { gsap } from 'gsap'

/**
 * Single source of motion for the shell. Components use these presets
 * instead of ad-hoc tweens so every animation shares timing and easing.
 *
 * Rules (site-wide):
 * - Super fast: every user-facing tween is 50–160ms. Nothing blocks,
 *   waits on, or outlives the interaction that triggered it.
 * - Instant feedback: press feedback fires on pointerdown, not click.
 * - Only transform/opacity are animated (compositor-only, no layout),
 *   except the deliberate sidebar width tween (see `panelWidth`).
 * - `prefers-reduced-motion` disables all of it.
 */

const reduced = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

gsap.defaults({ duration: 0.12, ease: 'power2.out' })
gsap.ticker.lagSmoothing(500, 33)

const ok = () => !reduced?.matches

/** Cap staggered items so a long list still finishes in ~150ms total. */
const MAX_STAGGER_ITEMS = 12

export const motion = {
  tabIn(el: Element) {
    if (!ok()) return
    gsap.fromTo(el, { opacity: 0, y: 2, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.12, ease: 'expo.out', clearProps: 'transform' })
  },

  /** Collapse a removed tab's ghost slot away immediately (~200ms, no hold). */
  tabExit(el: HTMLElement) {
    if (!ok()) return
    gsap.fromTo(
      el,
      { opacity: 1, width: el.offsetWidth, flex: 'none' },
      { opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0, duration: 0.2, ease: 'power2.in' }
    )
  },

  /** Subtle hairline pulse for the workspace row a switch just activated (~240ms). */
  workspaceGlow(el: Element) {
    if (!ok()) return
    gsap.fromTo(
      el,
      { boxShadow: 'inset 0 0 0 1px rgb(96 165 250 / 0.5)' },
      { boxShadow: 'inset 0 0 0 1px rgb(96 165 250 / 0)', duration: 0.24, ease: 'power2.out', clearProps: 'boxShadow' }
    )
  },

  /** Kill any tween on `el` (e.g. tabIn) so it stops fighting a drag. */
  stop(el: Element | null | undefined) {
    if (!el) return
    gsap.killTweensOf(el)
    gsap.set(el, { clearProps: 'transform,opacity' })
  },

  fadeIn(el: Element, delay = 0) {
    if (!ok()) return
    gsap.fromTo(el, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.14, delay, ease: 'expo.out', clearProps: 'transform' })
  },

  /** Opacity-only fade (dialog backdrops). */
  fade(el: Element) {
    if (!ok()) return
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: 'power1.out' })
  },

  /** Fast surface entrance: dialogs, popovers, menus, overlay panels. */
  popIn(el: Element) {
    if (!ok()) return
    gsap.fromTo(
      el,
      { opacity: 0, y: 3, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.12, ease: 'expo.out', clearProps: 'transform', overwrite: true }
    )
  },

  /**
   * Surface entrance plus a micro-stagger of its `[data-animate-item]`
   * rows (menu items, list rows). 10ms stagger, capped, so the whole
   * cascade lands in ~150ms and never feels like waiting.
   */
  surfaceIn(el: Element) {
    motion.popIn(el)
    if (!ok()) return
    const items = el.querySelectorAll('[data-animate-item]')
    if (items.length < 2) return
    gsap.fromTo(
      Array.from(items).slice(0, MAX_STAGGER_ITEMS),
      { opacity: 0, y: 3 },
      { opacity: 1, y: 0, duration: 0.1, ease: 'expo.out', stagger: 0.01, clearProps: 'transform,opacity', overwrite: false }
    )
  },

  /**
   * Bare list entrance (no surface pop): a micro-stagger of the list's
   * `[data-animate-item]` rows, same timing as `surfaceIn`'s cascade.
   * Used for in-panel lists that appear while typing (chat tab matches),
   * so rows settle in instead of snapping into place.
   */
  listIn(el: Element) {
    if (!ok()) return
    const items = el.querySelectorAll('[data-animate-item]')
    if (items.length === 0) return
    gsap.fromTo(
      Array.from(items).slice(0, MAX_STAGGER_ITEMS),
      { opacity: 0, y: 3 },
      { opacity: 1, y: 0, duration: 0.1, ease: 'expo.out', stagger: 0.012, clearProps: 'transform,opacity', overwrite: true }
    )
  },

  /** Dock-style entrance: a short upward slide + fade (180ms), no bounce. */
  dockIn(el: Element) {
    if (!ok()) return
    gsap.fromTo(
      el,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.18, ease: 'power3.out', clearProps: 'transform', overwrite: true }
    )
  },

  /** Dock-style exit: sink + fade (140ms), then `done` (fires immediately under reduced motion). */
  dockOut(el: Element | null, done: () => void) {
    if (!el || !ok()) return done()
    gsap.to(el, { opacity: 0, y: 8, duration: 0.14, ease: 'power2.in', overwrite: true, onComplete: done })
  },

  /** Click-time press spring (kept for existing call sites). */
  press(el: Element) {
    if (!ok()) return
    gsap.fromTo(el, { scale: 0.95 }, { scale: 1, duration: 0.14, ease: 'expo.out', overwrite: true, clearProps: 'transform' })
  },

  /**
   * Side-panel resize: a short (160ms) GSAP width tween in small per-frame
   * pixel steps, `power3.out` so it responds instantly and settles softly.
   * Animating the aside's width (layout, deliberately — the one exception
   * to the transform-only rule above) drives the flex page area beside it,
   * whose ResizeObserver re-reports the native page bounds each frame, so
   * the page follows the panel instead of jumping in one frame. Returns
   * null under reduced motion, after snapping to the final width.
   */
  panelWidth(el: Element, to: number, onUpdate: (width: number) => void, onComplete: () => void) {
    if (!ok()) {
      gsap.set(el, { width: to })
      onUpdate(to)
      onComplete()
      return null
    }
    return gsap.to(el, {
      width: to,
      duration: 0.16,
      ease: 'power3.out',
      overwrite: true,
      onUpdate: () => onUpdate(Number(gsap.getProperty(el, 'width'))),
      onComplete
    })
  },

  /** Indeterminate-feeling progress: eases toward 85%, completes on stop. */
  loadingStart(el: Element) {
    gsap.killTweensOf(el)
    gsap.set(el, { opacity: 1, scaleX: 0, transformOrigin: '0 50%' })
    gsap.to(el, { scaleX: 0.85, duration: ok() ? 4 : 0, ease: 'power3.out' })
  },

  loadingEnd(el: Element) {
    gsap.killTweensOf(el)
    if (!ok()) return void gsap.set(el, { opacity: 0 })
    gsap.timeline()
      .to(el, { scaleX: 1, duration: 0.1, ease: 'power1.out' })
      .to(el, { opacity: 0, duration: 0.12 }, '+=0.03')
  }
}

let installed = false

/**
 * Site-wide instant press feedback, installed once per renderer (shell +
 * overlay). On pointerdown — before click fires — any small button scales
 * to 0.93 in 50ms; it springs back on release. This is what makes the
 * whole UI feel responsive without touching every component.
 *
 * Skipped, deliberately:
 * - full-width / tall rows (width > 180px or height > 48px): scaling them
 *   drags glyphs off their layout axis (see Sidebar's panel toggle);
 * - elements that already carry a CSS transform (e.g. `-translate-y-1/2`
 *   centred controls) — GSAP would overwrite it;
 * - disabled controls and anything under `[data-no-press]`.
 */
export function installMotion() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!ok() || e.button !== 0) return
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], a[href]')
      if (!(el instanceof HTMLElement)) return
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return
      if (el.closest('[data-no-press]')) return
      const r = el.getBoundingClientRect()
      if (r.width > 180 || r.height > 48) return
      if (getComputedStyle(el).transform !== 'none') return

      gsap.to(el, { scale: 0.93, duration: 0.05, ease: 'power1.out', overwrite: true })
      const release = () => {
        gsap.to(el, { scale: 1, duration: 0.12, ease: 'expo.out', overwrite: true, clearProps: 'transform' })
      }
      window.addEventListener('pointerup', release, { once: true })
      window.addEventListener('pointercancel', release, { once: true })
    },
    { capture: true, passive: true }
  )
}
