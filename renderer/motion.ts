import { gsap } from 'gsap'

/**
 * Single source of motion for the shell. Components use these presets
 * instead of ad-hoc tweens so every animation shares timing and easing.
 * Only transform/opacity are animated (compositor-only, no layout).
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

gsap.defaults({ duration: 0.18, ease: 'power2.out' })
gsap.ticker.lagSmoothing(500, 33)

const ok = () => !reduced.matches

export const motion = {
  tabIn(el: Element) {
    if (!ok()) return
    gsap.fromTo(el, { opacity: 0, y: 3, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, clearProps: 'transform' })
  },

  /** Kill any tween on `el` (e.g. tabIn) so it stops fighting a drag. */
  stop(el: Element | null | undefined) {
    if (!el) return
    gsap.killTweensOf(el)
    gsap.set(el, { clearProps: 'transform,opacity' })
  },

  fadeIn(el: Element, delay = 0) {
    if (!ok()) return
    gsap.fromTo(el, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.24, delay, ease: 'expo.out' })
  },

  press(el: Element) {
    if (!ok()) return
    gsap.fromTo(el, { scale: 0.92 }, { scale: 1, duration: 0.22, ease: 'expo.out', overwrite: true })
  },

  /**
   * Side-panel resize: a short (240ms) GSAP width tween in small per-frame
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
      duration: 0.24,
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
      .to(el, { scaleX: 1, duration: 0.16, ease: 'power1.out' })
      .to(el, { opacity: 0, duration: 0.2 }, '+=0.05')
  }
}
