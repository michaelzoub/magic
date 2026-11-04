import { useEffect, useRef, useState } from 'react'
import type { IdentitySpec } from '@core/identity'
import { drawPixelTotem } from './renderTotem'

/**
 * Canvas totem with strictly finite animation:
 * - `progress` changes tween over ~450ms (onboarding assembly/reveal);
 * - a change of `pulseKey` plays one ~900ms subtle swell (profile opened);
 * - otherwise it draws exactly once per spec/size change — no idle loop.
 * Under prefers-reduced-motion both are instant/static.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function PixelTotem({ spec, size = 96, progress = 1, pulseKey = 0, ambient = false, thinking = false, label, className }: {
  spec: IdentitySpec
  size?: number
  progress?: number
  /** Increment to play one pulse (e.g. when the profile is opened). */
  pulseKey?: number
  /**
   * Gentle continuous breathing while mounted (profile dialog only — the
   * one place a living identity is on display). ~30fps, stops on unmount,
   * and never starts under prefers-reduced-motion.
   */
  ambient?: boolean
  /** Faster, stronger swell while the agent is working (bottom dock). Same loop as `ambient`, livelier period/amplitude. */
  thinking?: boolean
  label?: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shown = useRef({ progress, pulse: 0 })
  const raf = useRef(0)

  const draw = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = Math.round(size * dpr)
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px
      canvas.height = px
    }
    drawPixelTotem(ctx, spec, { width: px, height: px, progress: shown.current.progress, pulse: shown.current.pulse })
  }

  // Animate progress/pulse with one finite rAF tween; cancel on re-trigger.
  const animateTo = (targetProgress: number, withPulse: boolean) => {
    cancelAnimationFrame(raf.current)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      shown.current = { progress: targetProgress, pulse: 0 }
      draw()
      return
    }
    const from = shown.current.progress
    const start = performance.now()
    const duration = withPulse ? 900 : 450
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      shown.current = {
        progress: from + (targetProgress - from) * eased,
        pulse: withPulse ? Math.sin(t * Math.PI) : 0
      }
      draw()
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else shown.current.pulse = 0
    }
    raf.current = requestAnimationFrame(tick)
  }

  // Static redraw on spec/size change (also the first paint).
  useEffect(() => {
    shown.current.progress = progress
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, size])

  useEffect(() => {
    if (progress !== shown.current.progress) animateTo(progress, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress])

  useEffect(() => {
    if (pulseKey > 0) animateTo(shown.current.progress, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey])

  // Ambient breathing: one rAF loop for the component's lifetime, throttled
  // to ~30fps (the grid is 24x24 fillRects, so each frame is cheap).
  useEffect(() => {
    if (!ambient && !thinking) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let rafId = 0
    let last = 0
    const start = performance.now()
    const period = thinking ? 2400 : 3600
    const amplitude = thinking ? 1 : 0.6
    const baseProgress = shown.current.progress
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)
      if (now - last < 33) return
      last = now
      // 0 → amplitude → 0 over `period`, starting and ending at rest.
      const phase = (Math.sin(((now - start) / period) * Math.PI * 2 - Math.PI / 2) + 1) / 2
      shown.current.pulse = phase * amplitude
      // Thinking also waves the assembly progress, so cells visibly stack
      // and unstack — the pulse alone is sub-pixel at dock size (34px).
      if (thinking) shown.current.progress = (0.55 + 0.45 * phase) * baseProgress
      draw()
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      shown.current = { progress: baseProgress, pulse: 0 }
      draw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient, thinking, spec, size])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label ?? `Pixel totem identity (${spec.palette.name})`}
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
