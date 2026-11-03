import { useEffect, useState } from 'react'
import { composeGoalWithSites, OnboardingFlow, type OnboardingData } from '../../../core/onboarding'
import type { CompletedOnboarding } from '@shared/onboarding'
import { uiStep, type OnboardingStepProps } from '@/components/onboarding/OnboardingWizard'
import { Check, Close, Globe, Pencil, Plus, Sparkles, User } from '@/components/icons'
import { completeOnboarding } from './completeOnboarding'

/** Answers collected by the first step, saved under the `welcome` step id. */
export interface WelcomeAnswers {
  name: string
  description: string
}

const field =
  'w-full rounded-[10px] border border-white/10 bg-white/[0.05] py-2.5 pl-9 pr-3 text-[13px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/25 focus:bg-white/[0.08]'

function WelcomeStep({ value, setValue }: OnboardingStepProps<WelcomeAnswers>) {
  const answers = value ?? { name: '', description: '' }
  const update = (patch: Partial<WelcomeAnswers>) => setValue({ ...answers, ...patch })
  return (
    <div className="relative">
      <Sparkles className="absolute right-0 top-0 text-white/40" width={20} height={20} />
      <h3 className="pr-8 text-[20px] font-semibold leading-snug tracking-tight">Hey there! Welcome to Magic!</h3>
      <p className="mt-1.5 text-[13px] text-white/50">To get started, what would you like to be referred to as?</p>

      <div className="relative mt-3">
        <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          autoFocus
          value={answers.name}
          onInput={(e) => update({ name: e.currentTarget.value })}
          placeholder="e.g. Alex"
          aria-label="What would you like to be referred to as?"
          className={field}
        />
      </div>

      <label className="mt-5 block text-[15px] font-semibold tracking-tight" htmlFor="onboarding-description">
        What best describes you in one sentence?
      </label>
      <div className="relative mt-3">
        <Pencil className="pointer-events-none absolute left-3 top-3 text-white/40" />
        <textarea
          id="onboarding-description"
          rows={4}
          value={answers.description}
          onInput={(e) => update({ description: e.currentTarget.value })}
          placeholder="e.g. A student and builder who loves design, technology, and creating things."
          className={`${field} resize-none leading-relaxed`}
        />
      </div>
    </div>
  )
}

/** One checked area on the goals step, with the goal the user set for it. */
export interface GoalSelection {
  name: string
  goal: string
}

/** Answers collected by the goals step, saved under the `goals` step id. */
export interface GoalsAnswers {
  /** Every option shown: the base areas plus any the user added. */
  options: string[]
  /** Areas the user checked, each with its own goal. */
  selected: GoalSelection[]
}

export const BASE_AREAS = [
  'Work',
  'School',
  'Coding',
  'Research',
  'Writing',
  'Business',
  'Shopping',
  'Travel',
  'Personal projects',
  'Entertainment'
]

/** Every preset area already has a goal — checking it in step 2 is enough. Editing it happens in step 3's goal text. */
export const PRESET_GOALS: Record<string, string> = {
  Work: 'Get work projects done and stay on top of messages and meetings',
  School: 'Finish coursework and keep up with classes',
  Coding: 'Build, debug, and ship software',
  Research: 'Read papers and stay current in the field',
  Writing: 'Draft and polish documents',
  Business: 'Track the market and grow the business',
  Shopping: 'Find and buy what I need at a good price',
  Travel: 'Plan trips and book travel',
  'Personal projects': 'Make progress on personal projects',
  Entertainment: 'Watch, listen, and unwind'
}

function GoalsStep({ value, setValue, data }: OnboardingStepProps<GoalsAnswers>) {
  const answers: GoalsAnswers = value ?? { options: BASE_AREAS, selected: [] }
  const [newArea, setNewArea] = useState('')
  const name = (data.welcome as WelcomeAnswers | undefined)?.name?.trim() || (data.name as string | undefined)
  const selectedFor = (area: string) => answers.selected.find((s) => s.name === area)

  const toggle = (area: string) =>
    setValue({
      ...answers,
      selected: selectedFor(area)
        ? answers.selected.filter((s) => s.name !== area)
        : [...answers.selected, { name: area, goal: PRESET_GOALS[area] ?? '' }]
    })

  const setGoal = (area: string, goal: string) =>
    setValue({ ...answers, selected: answers.selected.map((s) => (s.name === area ? { ...s, goal } : s)) })

  const addArea = () => {
    const area = newArea.trim()
    if (!area) return
    if (answers.options.some((o) => o.toLowerCase() === area.toLowerCase())) {
      // Already listed — just check it instead of adding a duplicate.
      if (!selectedFor(area)) toggle(answers.options.find((o) => o.toLowerCase() === area.toLowerCase())!)
    } else {
      setValue({ options: [...answers.options, area], selected: [...answers.selected, { name: area, goal: '' }] })
    }
    setNewArea('')
  }

  const removeArea = (area: string) =>
    setValue({
      options: answers.options.filter((o) => o !== area),
      selected: answers.selected.filter((s) => s.name !== area)
    })

  return (
    <div>
      <h3 className="text-[20px] font-semibold leading-snug tracking-tight">
        {name ? `${name}, what` : 'What'} will you use Magic for?
      </h3>
      <p className="mt-1.5 text-[13px] text-white/50">Pick all that apply. Presets already have a goal — you can fine-tune the wording in the next step.</p>

      <div className="mt-3 flex flex-col gap-1.5">
        {answers.options.map((area) => {
          const selection = selectedFor(area)
          const custom = !BASE_AREAS.includes(area)
          return (
            <div
              key={area}
              className={`rounded-[10px] border transition-colors ${
                selection ? 'border-white/25 bg-white/[0.08]' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!selection}
                  onClick={() => toggle(area)}
                  className="flex flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <span
                    className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
                      selection ? 'border-white bg-white text-black' : 'border-white/30 text-transparent'
                    }`}
                  >
                    <Check width={12} height={12} />
                  </span>
                  <span className="text-[13px] font-medium">{area}</span>
                </button>
                {custom && (
                  <button
                    type="button"
                    aria-label={`Remove ${area}`}
                    onClick={() => removeArea(area)}
                    className="mr-2 grid h-6 w-6 place-items-center rounded-[6px] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <Close width={12} height={12} />
                  </button>
                )}
              </div>
              {selection && (
                <div className="px-3 pb-3 pl-[43px]">
                  {PRESET_GOALS[area] ? (
                    <>
                      <p className="text-[11px] font-medium text-white/45">Goal</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-white/75">{PRESET_GOALS[area]}</p>
                    </>
                  ) : (
                    <>
                      <label className="block text-[11px] font-medium text-white/45" htmlFor={`goal-${area}`}>
                        Goal for {area}
                      </label>
                      <input
                        id={`goal-${area}`}
                        autoFocus={answers.selected[answers.selected.length - 1]?.name === area && !selection.goal}
                        value={selection.goal}
                        onInput={(e) => setGoal(area, e.currentTarget.value)}
                        placeholder={`e.g. My goal for ${area.toLowerCase()}`}
                        className="mt-1.5 w-full rounded-[8px] border border-white/10 bg-black/20 px-2.5 py-2 text-[13px] outline-none placeholder:text-white/30 focus:border-white/25 focus:bg-black/30"
                      />
                    </>
                  )}
                  {SUGGESTED_SITES[area] && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/35">
                      <Globe width={12} height={12} className="shrink-0" />
                      <span>
                        Example sites: {SUGGESTED_SITES[area].join(', ')}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex gap-1.5">
        <div className="relative flex-1">
          <Plus className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={newArea}
            onInput={(e) => setNewArea(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addArea())}
            placeholder="Add your own — e.g. Music, Fitness, Family"
            aria-label="Add your own area"
            className="w-full rounded-[10px] border border-dashed border-white/15 bg-transparent py-2.5 pl-8 pr-3 text-[13px] outline-none placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.04]"
          />
        </div>
        <button
          type="button"
          disabled={!newArea.trim()}
          onClick={addArea}
          className="no-drag shrink-0 rounded-[10px] bg-white/[0.08] px-3 text-[12px] font-medium transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

/** Example websites suggested per base area on the sites step — max 2 each, so the step isn't overwhelming. Fully editable there. */
export const SUGGESTED_SITES: Record<string, string[]> = {
  Work: ['gmail.com', 'calendar.google.com'],
  School: ['classroom.google.com', 'scholar.google.com'],
  Coding: ['github.com', 'stackoverflow.com'],
  Research: ['arxiv.org', 'scholar.google.com'],
  Writing: ['docs.google.com', 'notion.so'],
  Business: ['linkedin.com', 'crunchbase.com'],
  Shopping: ['amazon.com', 'ebay.com'],
  Travel: ['google.com/travel', 'booking.com'],
  'Personal projects': ['notion.so', 'github.com'],
  Entertainment: ['youtube.com', 'netflix.com']
}

/** Per-workspace answers on the sites step: its editable sites and its actual goal text. */
export interface WorkspaceSites {
  sites: string[]
  /** The workspace's final goal text — starts as the preset/step-2 goal with the sites concatenated in, and is editable here. */
  goalText: string
}

/**
 * Answers collected by the sites step, saved under the `sites` step id,
 * keyed by area/workspace name.
 */
export type SitesAnswers = Record<string, WorkspaceSites>

function WorkspaceSitesCard({
  selection,
  sites,
  goalText,
  onSitesChange,
  onGoalTextChange
}: {
  selection: GoalSelection
  sites: string[]
  goalText: string
  onSitesChange(sites: string[]): void
  onGoalTextChange(goalText: string): void
}) {
  const [newSite, setNewSite] = useState('')
  const addSite = () => {
    const site = newSite.trim()
    if (!site) return
    if (!sites.some((s) => s.toLowerCase() === site.toLowerCase())) onSitesChange([...sites, site])
    setNewSite('')
  }
  const inputCls =
    'w-full rounded-[8px] border border-white/10 bg-black/20 py-2 pl-8 pr-3 text-[13px] outline-none placeholder:text-white/30 focus:border-white/25 focus:bg-black/30'
  return (
    <section className="rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-3">
      <h4 className="text-[14px] font-semibold tracking-tight">{selection.name}</h4>
      <p className="mt-0.5 text-[12px] text-white/45">{selection.goal}</p>

      <p className="mt-3 text-[11px] font-medium text-white/45">Example websites for {selection.name}</p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {sites.map((site, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={site}
                onInput={(e) => onSitesChange(sites.map((s, j) => (j === i ? e.currentTarget.value : s)))}
                aria-label={`Website ${i + 1} for ${selection.name}`}
                placeholder="e.g. arxiv.org"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove ${site || 'website'} from ${selection.name}`}
              onClick={() => onSitesChange(sites.filter((_, j) => j !== i))}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <Close width={12} height={12} />
            </button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Plus className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={newSite}
              onInput={(e) => setNewSite(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSite())}
              placeholder="Add a website — e.g. example.com"
              aria-label={`Add a website for ${selection.name}`}
              className={`${inputCls} border-dashed bg-transparent focus:bg-white/[0.04]`}
            />
          </div>
          <button
            type="button"
            disabled={!newSite.trim()}
            onClick={addSite}
            className="no-drag shrink-0 rounded-[8px] bg-white/[0.08] px-3 text-[12px] font-medium transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      <label className="mt-3 block text-[11px] font-medium text-white/45" htmlFor={`goal-text-${selection.name}`}>
        Goal text
      </label>
      <textarea
        id={`goal-text-${selection.name}`}
        rows={3}
        value={goalText}
        onInput={(e) => onGoalTextChange(e.currentTarget.value)}
        aria-describedby={`goal-text-note-${selection.name}`}
        className="mt-1.5 w-full resize-none rounded-[8px] border border-white/10 bg-black/20 px-2.5 py-2 text-[12px] leading-relaxed outline-none placeholder:text-white/30 focus:border-white/25 focus:bg-black/30"
      />
      <p id={`goal-text-note-${selection.name}`} className="mt-1 text-[11px] text-white/35">
        This is the workspace’s actual goal — edit it here. Editing the sites above rebuilds it from the goal + sites.
      </p>
    </section>
  )
}

function SitesStep({ value, setValue, data }: OnboardingStepProps<SitesAnswers>) {
  const selected = (data.goals as GoalsAnswers | undefined)?.selected ?? []

  /** Stored entry for a workspace, or the seeded default (suggested sites + composed goal text). */
  const entryFor = (selection: GoalSelection): WorkspaceSites => {
    const stored = value?.[selection.name]
    if (stored) return stored
    const sites = SUGGESTED_SITES[selection.name] ?? []
    return { sites, goalText: composeGoalWithSites(selection.name, selection.goal, sites) }
  }

  // Seed the defaults into the answers on first showing, so what the user
  // sees is what gets saved even if they never touch a card.
  useEffect(() => {
    const missing = selected.filter((s) => !(s.name in (value ?? {})))
    if (missing.length > 0) {
      setValue({ ...value, ...Object.fromEntries(missing.map((s) => [s.name, entryFor(s)])) })
    }
    // Only on mount: afterwards the stored answers are the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h3 className="text-[20px] font-semibold leading-snug tracking-tight">Where do you do each of these?</h3>
      <p className="mt-1.5 text-[13px] text-white/50">
        Add example websites for each workspace. They’re added to its goal text, so Magic knows where it happens.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {selected.map((selection) => {
          const entry = entryFor(selection)
          return (
            <WorkspaceSitesCard
              key={selection.name}
              selection={selection}
              sites={entry.sites}
              goalText={entry.goalText}
              onSitesChange={(sites) =>
                setValue({
                  ...value,
                  // Editing sites rebuilds the goal text from the goal + sites.
                  [selection.name]: { sites, goalText: composeGoalWithSites(selection.name, selection.goal, sites) }
                })
              }
              onGoalTextChange={(goalText) => setValue({ ...value, [selection.name]: { ...entry, goalText } })}
            />
          )
        })}
      </div>
      {selected.length === 0 && <p className="mt-3 text-[13px] text-white/50">Go back and pick at least one area first.</p>}
    </div>
  )
}

/**
 * The real onboarding flow. The first step is the welcome screen (name +
 * one-sentence description); completing the flow saves the profile and
 * initial settings to SQLite via `completeOnboarding`.
 */
export function createOnboarding(options: {
  onSave?(data: Readonly<OnboardingData>): void | Promise<CompletedOnboarding>
} = {}): OnboardingFlow {
  return OnboardingFlow.create(
    [
      uiStep<WelcomeAnswers>({
        id: 'welcome',
        title: 'Welcome',
        ui: WelcomeStep,
        initialValue: { name: '', description: '' },
        validate: (v) => {
          if (!v?.name.trim()) return 'Please enter what you’d like to be called'
          if (!v?.description.trim()) return 'Please describe yourself in one sentence'
          return null
        }
      }),
      uiStep<GoalsAnswers>({
        id: 'goals',
        title: 'Your goals',
        ui: GoalsStep,
        initialValue: { options: BASE_AREAS, selected: [] },
        validate: (v) => {
          if (!v?.selected.length) return 'Pick at least one area'
          // Presets already carry a goal; only user-added areas must supply one.
          const missing = v.selected.find((s) => !s.goal.trim() && !PRESET_GOALS[s.name])
          return missing ? `Add a goal for ${missing.name}` : null
        }
      }),
      uiStep<SitesAnswers>({
        id: 'sites',
        title: 'Example websites',
        ui: SitesStep,
        initialValue: {},
        validate: (v, data) => {
          const selected = (data.goals as GoalsAnswers | undefined)?.selected ?? []
          if (selected.length === 0) return 'Pick at least one area first'
          for (const s of selected) {
            const entry = v?.[s.name]
            const sites = entry?.sites ?? SUGGESTED_SITES[s.name] ?? []
            if (!sites.some((site) => site.trim())) return `Add at least one website for ${s.name}`
            const goalText = entry?.goalText ?? composeGoalWithSites(s.name, s.goal, sites)
            if (!goalText.trim()) return `The goal text for ${s.name} can’t be empty`
          }
          return null
        }
      })
    ],
    { onSave: options.onSave ?? completeOnboarding }
  )
}
