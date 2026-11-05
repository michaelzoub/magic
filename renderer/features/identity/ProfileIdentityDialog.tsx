import { useEffect, useMemo, useState } from 'react'
import { buildIdentityExplanation, createIdentitySpec } from '@core/identity'
import type { CompletedOnboarding, UpdateProfileInput } from '@shared/onboarding'
import { Button, Chip, Dialog } from '@/components/ui'
import { ChevronRight, Download, Pencil, Plus, Trash } from '@/components/ui/icons'
import { PixelTotem } from './PixelTotem'
import { ModelKeySection } from '@/features/settings/ModelKeySection'
import { parseSitesInput, profileDetails } from './profileDetails'

const field =
  'w-full rounded-[6px] bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:bg-white/[0.08] focus:ring-1 focus:ring-white/40'
const labelClass = 'block text-xs font-medium text-white/45'
const sectionLabel = 'text-xs font-medium text-white/45'

/** "a, b and c" for short human-readable lists. */
const list = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** One editable focus-area row: its name, its goal, and its example sites as one comma-separated field. */
interface DraftRow {
  name: string
  goal: string
  sites: string
}

/**
 * Profile & identity view, opened from the sidebar account/settings row.
 * One persistent totem — the same spec the sidebar avatar renders from the
 * persisted seed, just larger — presented as a personal identity page.
 * The totem breathes gently while the dialog is open (Canvas 2D, and
 * static under prefers-reduced-motion).
 *
 * Layout: a wide, two-column page — identity (totem, name, edit action) on
 * the left, scannable profile details (description, interest chips, goals,
 * example sites, and a collapsed note on how the totem was generated) on
 * the right — so it fits a normal desktop viewport without scrolling; the
 * details column only scrolls when the viewport is genuinely too small.
 *
 * Editing happens in place and saves through the existing profile update:
 * name + description, plus the goals/sites settings when edited. The
 * identity seed and the canonical identity inputs behind the totem are
 * never part of an edit, so the totem stays exactly as it was.
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
  const details = useMemo(() => profileDetails(completed), [completed])
  const description =
    (typeof completed?.settings.description === 'string' ? completed.settings.description : profile?.goal) || ''

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
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

  const rowsFromDetails = (): DraftRow[] =>
    details.goals.map((g) => ({
      name: g.name,
      goal: g.goal,
      sites: (details.sitesByArea.find((s) => s.area.toLowerCase() === g.name.toLowerCase())?.sites ?? []).join(', ')
    }))

  const startEdit = () => {
    setDraftName(profile?.displayName ?? '')
    setDraftDescription(description)
    setDraftRows(rowsFromDetails())
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (!onSaveProfile || saving) return
    // Drop blank rows; a row with a goal or sites but no area name cannot be
    // stored (goals/sites are keyed by area), so ask for the name instead
    // of silently losing the text.
    const rows = draftRows
      .map((r) => ({ name: r.name.trim(), goal: r.goal.trim(), sites: parseSitesInput(r.sites) }))
      .filter((r) => r.name || r.goal || r.sites.length > 0)
    if (rows.some((r) => !r.name)) {
      setError('Give each focus area a name, or clear its goal and sites.')
      return
    }
    const sites: Record<string, string[]> = {}
    for (const r of rows) {
      if (r.sites.length === 0) continue
      const existing = Object.keys(sites).find((k) => k.toLowerCase() === r.name.toLowerCase())
      sites[existing ?? r.name] = parseSitesInput([...(existing ? sites[existing]! : []), ...r.sites].join(','))
    }
    setSaving(true)
    setError(null)
    try {
      await onSaveProfile({
        displayName: draftName.trim(),
        description: draftDescription.trim(),
        goals: rows.map(({ name, goal }) => ({ name, goal })),
        sites
      })
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

  const setRow = (index: number, patch: Partial<DraftRow>) =>
    setDraftRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  return (
    <Dialog open={open} onClose={onClose} label="Profile & identity" widthClass="w-[min(880px,100%)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {profile && spec ? (
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[192px_minmax(0,1fr)]">
              {/* Identity: totem, name, and the edit action stay together. */}
              <div className="flex items-start gap-4 sm:flex-col sm:gap-3">
                <PixelTotem spec={spec} size={176} ambient className="shrink-0 rounded-[14px]" label="Your Magic totem" />
                <div className="min-w-0">
                  {editing ? (
                    <div className="w-[176px] max-w-full">
                      <label className={labelClass} htmlFor="profile-display-name">
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
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold leading-snug tracking-tight text-white">{profile.displayName}</h2>
                      {onSaveProfile && (
                        <Button variant="ghost" onClick={startEdit} className="mt-2">
                          <Pencil width={12} height={12} />
                          Edit profile
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Details: structured, left-aligned, scannable. */}
              <div className="min-w-0">
                {editing ? (
                  <div>
                    <label className={labelClass} htmlFor="profile-description">
                      Description
                    </label>
                    <textarea
                      id="profile-description"
                      rows={2}
                      value={draftDescription}
                      onInput={(e) => setDraftDescription(e.currentTarget.value)}
                      placeholder="A sentence about you"
                      className={`mt-1.5 resize-none leading-relaxed ${field}`}
                    />

                    <div className="mt-5 flex items-center justify-between">
                      <span className={sectionLabel} id="profile-areas-label">
                        Interests and goals
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => setDraftRows((rows) => [...rows, { name: '', goal: '', sites: '' }])}
                      >
                        <Plus width={11} height={11} />
                        Add area
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-col gap-4" role="group" aria-labelledby="profile-areas-label">
                      {draftRows.map((row, i) => (
                        <div key={i} className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                          <input
                            aria-label={`Focus area ${i + 1} name`}
                            value={row.name}
                            onInput={(e) => setRow(i, { name: e.currentTarget.value })}
                            placeholder="Area"
                            className={`${field} self-start`}
                          />
                          <div className="flex min-w-0 flex-col gap-2">
                            <input
                              aria-label={`Goal for ${row.name || `area ${i + 1}`}`}
                              value={row.goal}
                              onInput={(e) => setRow(i, { goal: e.currentTarget.value })}
                              placeholder="Goal for this area"
                              className={field}
                            />
                            <input
                              aria-label={`Example sites for ${row.name || `area ${i + 1}`}`}
                              value={row.sites}
                              onInput={(e) => setRow(i, { sites: e.currentTarget.value })}
                              placeholder="Example sites, comma-separated"
                              className={field}
                            />
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${row.name || `area ${i + 1}`}`}
                            onClick={() => setDraftRows((rows) => rows.filter((_, j) => j !== i))}
                            className="no-drag grid h-6 w-6 place-items-center self-start rounded-[6px] text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/75 [&_svg]:size-3.5"
                          >
                            <Trash width={13} height={13} />
                          </button>
                        </div>
                      ))}
                      {draftRows.length === 0 && (
                        <p className="text-xs text-white/35">No focus areas yet — add one to track a goal.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {description && <p className="max-w-[52ch] text-base leading-relaxed text-white/70">{description}</p>}

                    {details.areas.length > 0 && (
                      <section aria-label="Interests" className={description ? 'mt-5' : ''}>
                        <h3 className={sectionLabel}>Interests</h3>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {details.areas.map((area) => (
                            <li key={area} className="flex">
                              <Chip>{area}</Chip>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {details.goals.some((g) => g.goal) && (
                      <section aria-label="Goals" className="mt-5">
                        <h3 className={sectionLabel}>Goals</h3>
                        <ul className="mt-2 flex flex-col gap-2.5">
                          {details.goals
                            .filter((g) => g.goal)
                            .map((g, i) => (
                              <li key={`${g.name}-${i}`} className="flex gap-3 text-sm leading-relaxed">
                                {g.name && <span className="w-[104px] shrink-0 font-medium text-white/70">{g.name}</span>}
                                <span className="min-w-0 text-white/55">{g.goal}</span>
                              </li>
                            ))}
                        </ul>
                      </section>
                    )}

                    {details.sitesByArea.length > 0 && (
                      <section aria-label="Example sites" className="mt-5">
                        <h3 className={sectionLabel}>Example sites</h3>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {details.sitesByArea.map((group) => (
                            <li key={group.area || 'sites'} className="flex gap-3 text-xs leading-relaxed text-white/40">
                              {group.area && <span className="w-[104px] shrink-0 text-white/50">{group.area}</span>}
                              <span className="min-w-0">{group.sites.join(', ')}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {explanation && (
                      <section aria-label="About your identity" className="mt-7">
                        <h3 className={sectionLabel}>About your identity</h3>
                        <p className="mt-2 max-w-[58ch] text-xs leading-relaxed text-white/45">
                          Your setup answers shaped this totem — its {explanation.paletteName} colours, its{' '}
                          {list(explanation.patterns)} patterns, and a layout {explanation.symmetry}.
                        </p>
                        {explanation.influences.length > 0 && (
                          <details className="group mt-1.5">
                            <summary className="no-drag inline-flex h-6 cursor-pointer list-none items-center gap-1 rounded-[6px] px-1 text-xs font-medium text-white/40 transition-colors hover:text-white/70 [&::-webkit-details-marker]:hidden">
                              <ChevronRight width={11} height={11} className="transition-transform group-open:rotate-90" />
                              How it was generated
                            </summary>
                            <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                              {explanation.influences.map((influence) => (
                                <div key={influence.id} className="flex gap-2 text-xs leading-relaxed">
                                  <dt className="shrink-0 text-white/35">{influence.label}</dt>
                                  <dd className="min-w-0 text-white/55">{influence.summary}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </section>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="max-w-[420px] py-4 text-sm leading-relaxed text-white/55">
              No identity yet — finish onboarding and Magic will generate your pixel totem and save it here.
            </p>
          )}
          {!editing && (
            <div className="mt-7">
              <ModelKeySection />
            </div>
          )}
        </div>

        {/* Footer: Import logins stays a quiet secondary action; edit actions live here while editing. */}
        {(onImportLogins || editing) && (
          <footer className="flex min-h-[44px] shrink-0 items-center justify-between gap-3 px-5 py-2">
            {editing ? (
              <>
                <p className="min-w-0 text-xs leading-relaxed text-red-300" role="alert">
                  {error ?? ''}
                </p>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() => (setEditing(false), setError(null))}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={saving || !draftName.trim()}
                    onClick={() => void save()}
                  >
                    {saving ? 'Saving' : 'Save'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {onImportLogins ? (
                  <Button variant="ghost" onClick={onImportLogins}>
                    <Download width={13} height={13} />
                    Import logins
                  </Button>
                ) : (
                  <span />
                )}
                <span className="text-2xs text-white/25">Stored locally on this device</span>
              </>
            )}
          </footer>
        )}
      </div>
    </Dialog>
  )
}
