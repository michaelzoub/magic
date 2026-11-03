import { useEffect, useMemo, useState } from 'react'
import { identitySpecFromOnboarding, type IdentitySpec } from '@core/identity'
import type { OnboardingData } from '@core/onboarding'
import { PixelTotem } from './PixelTotem'

/**
 * Live identity preview for the onboarding wizard. The spec is re-derived
 * from the answers collected so far on every render, so the totem evolves
 * (new palette/zones) as the user answers, while `progress` — the wizard's
 * step fraction — controls how much of it has assembled.
 */
export function OnboardingTotemPreview({ data, progress }: { data: Readonly<OnboardingData>; progress: number }) {
  const key = JSON.stringify(data)
  const spec = useMemo(() => identitySpecFromOnboarding(data), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex items-center gap-3">
      <PixelTotem spec={spec} size={44} progress={progress} className="shrink-0 rounded-[8px]" />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-white/85">Your Magic identity</p>
        <p className="truncate text-[11px] text-white/40">
          {progress >= 1 ? `${spec.palette.name} — fully assembled` : 'Assembling as you answer…'}
        </p>
      </div>
    </div>
  )
}

/** Full-size reveal shown once onboarding completes, before entering the app. */
export function OnboardingTotemReveal({ data }: { data: Readonly<OnboardingData> }) {
  const key = JSON.stringify(data)
  const spec = useMemo(() => identitySpecFromOnboarding(data), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const welcome = (data.welcome as { name?: string } | undefined)?.name?.trim()
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <RevealTotem spec={spec} />
      <h3 className="mt-4 text-[20px] font-semibold tracking-tight">
        {welcome ? `Welcome, ${welcome}` : 'Welcome to Magic'}
      </h3>
      <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-white/50">
        This pixel totem is your identity in Magic — generated from your answers, saved with your
        profile, and shown wherever your profile appears.
      </p>
      <p className="mt-2 text-[11px] text-white/35">{spec.palette.name}</p>
    </div>
  )
}

function RevealTotem({ spec }: { spec: IdentitySpec }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(1))
    return () => cancelAnimationFrame(id)
  }, [])
  return <PixelTotem spec={spec} size={168} progress={progress} className="rounded-[12px]" />
}
