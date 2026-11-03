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

  fadeIn(el: Element, delay = 0) {
    if (!ok()) return
    gsap.fromTo(el, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.24, delay, ease: 'expo.out' })
  },

  press(el: Element) {
    if (!ok()) return
    gsap.fromTo(el, { scale: 0.92 }, { scale: 1, duration: 0.22, ease: 'expo.out', overwrite: true })
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
