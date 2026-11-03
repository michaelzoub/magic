import { useEffect, useMemo, useState } from 'react'
import { buildIdentityExplanation, createIdentitySpec } from '@core/identity'
import type { CompletedOnboarding, UpdateProfileInput } from '@shared/onboarding'
import { Dialog } from '@/components/ui'
import { Download, Pencil } from '@/components/ui/icons'
import { PixelTotem } from './PixelTotem'

const field =
  'w-full rounded-[8px] border border-white/10 bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/25 focus:bg-white/[0.08]'

/** "a, b and c" for short human-readable lists. */
const list = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * Profile & identity view, opened from the sidebar account/settings row.
 * One persistent totem — the same spec the sidebar avatar renders from the
 * persisted seed, just larger — presented as a personal identity page:
 * artwork first, name and a short description below, nothing technical.
 * The totem breathes gently while the dialog is open (Canvas 2D, and
 * static under prefers-reduced-motion).
 *
 * The name and description can be edited in place; saving updates the
 * existing local profile and never touches the identity seed, so the
 * totem (and the "About your identity" explanation of the original
 * onboarding answers behind it) stays exactly as it was.
 */
export function ProfileIdentityDialog({ open, completed, onClose, onImportLogins, onSaveProfile }: {
  open: boolean
  completed: CompletedOnboarding | null
  onClose(): void
  /** Existing settings action that used to be this row's only destination. */
  onImportLogins?(): void
  /** Persist an edit to the existing profile; resolves with what was stored. */
  onSaveProfile?(input: UpdateProfileInput): Promise<CompletedOnboarding>
}) {
  const profile = completed?.profile ?? null
  // Same derivation as the sidebar avatar: persisted seed → spec. Opening
  // this dialog never regenerates or re-seeds the identity.
  const spec = useMemo(
    () => (profile?.identitySeed ? createIdentitySpec(profile.identitySeed) : null),
    [profile?.identitySeed]
  )
  const explanation = useMemo(() => (completed ? buildIdentityExplanation(completed) : null), [completed])
  const description =
    (typeof completed?.settings.description === 'string' ? completed.settings.description : profile?.goal) || ''

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Leaving the dialog (or the profile changing underneath a read-only
  // view) resets any in-progress edit.
  useEffect(() => {
    if (!open) setEditing(false)
  }, [open ])
  useEffect(() => {
    if (!editing) {
      setDraftName(profile?.displayName ?? '')
      setDraftDescription(description)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, profile?.displayName, description])

  if (!open) return null

  const startEdit = () => {
    setDraftName(profile?.displayName ?? '')
    setDraftDescription(description)
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (!onSaveProfile || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSaveProfile({ displayName: draftName.trim(), description: draftDescription.trim() })
      setEditing(false)
    } catch (e) {
      // Surface the real cause (e.g. a missing IPC handler after an app
      // update) instead of only a generic failure — and log it, since the
      // overlay renderer forwards console output to the main-process log.
      console.error('[profile] save failed', e)
      const detail = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+':\s*/, '') : ''
      setError(detail ? `Could not save your profile: ${detail}` : 'Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} label="Profile & identity">
      <div className="flex max-h-[calc(100vh-8rem)] flex-col items-center overflow-y-auto px-8 pb-8 pt-4 text-center">
        {profile && spec ? (
          <>
            <PixelTotem spec={spec} size={248} ambient className="rounded-[14px]" label="Your Magic totem" />
            {editing ? (
              <div className="mt-6 w-full max-w-[340px] text-left">
                <label className="block text-[12px] font-medium text-white/60" htmlFor="profile-display-name">
                  Display name
                </label>
                <input
                  id="profile-display-name"
                  autoFocus
                  value={draftName}
                  onInput={(e) => setDraftName(e.currentTarget.value)}
                  placeholder="Your name"
                  className={`mt-1.5 ${field}`}
                />
                <label className="mt-4 block text-[12px] font-medium text-white/60" htmlFor="profile-description">
                  Description
                </label>
                <textarea
                  id="profile-description"
                  rows={3}
                  value={draftDescription}
                  onInput={(e) => setDraftDescription(e.currentTarget.value)}
                  placeholder="A sentence about you"
                  className={`mt-1.5 resize-none leading-relaxed ${field}`}
                />
                {error && <p className="mt-3 text-[12px] leading-relaxed text-red-300">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => (setEditing(false), setError(null))}
                    className="no-drag h-8 rounded-[6px] px-3 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving || !draftName.trim()}
                    onClick={() => void save()}
                    className="no-drag h-8 rounded-[6px] bg-white/[0.1] px-3 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.16] disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="mt-6 text-[20px] font-semibold tracking-tight text-white">{profile.displayName}</h2>
                {description && (
                  <p className="mt-1.5 line-clamp-2 max-w-[340px] text-[13px] leading-relaxed text-white/50">{description}</p>
                )}
                {onSaveProfile && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="no-drag mt-3 inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                  >
                    <Pencil width={12} height={12} />
                    Edit profile
                  </button>
                )}
              </>
            )}

            {explanation && (
              <section aria-label="About your identity" className="mt-7 w-full max-w-[360px] border-t border-white/[0.07] pt-5 text-left">
                <h3 className="text-[12px] font-semibold text-white/75">About your identity</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/50">
                  Magic combined the answers you gave during setup to shape this totem. Together, they chose its{' '}
                  {explanation.paletteName} colours, its {list(explanation.patterns)} patterns, and a layout{' '}
                  {explanation.symmetry}.
                </p>
                {explanation.influences.length > 0 && (
                  <dl className="mt-3 flex flex-col gap-1.5">
                    {explanation.influences.map((influence) => (
                      <div key={influence.id} className="flex gap-2 text-[12px] leading-relaxed">
                        <dt className="shrink-0 text-white/40">{influence.label}</dt>
                        <dd className="min-w-0 text-white/65">{influence.summary}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}
          </>
        ) : (
          <p className="max-w-[320px] py-8 text-[13px] leading-relaxed text-white/55">
            No identity yet — finish onboarding and Magic will generate your pixel totem and save it here.
          </p>
        )}

        {onImportLogins && (
          <button
            type="button"
            onClick={onImportLogins}
            className="no-drag mt-8 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
          >
            <Download width={13} height={13} />
            Import logins…
          </button>
        )}
      </div>
    </Dialog>
  )
}
