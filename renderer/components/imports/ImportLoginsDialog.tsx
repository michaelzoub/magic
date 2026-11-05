import { useEffect, useState } from 'react'
import type { DetectedSource, LoginImportResult } from '@shared/import'
import { Button, Dialog } from '../ui'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; sources: DetectedSource[] }
  | { kind: 'importing'; label: string }
  | { kind: 'done'; result: LoginImportResult }
  | { kind: 'error'; message: string }

/**
 * Import logins (cookies/session tokens) from another Chromium browser so
 * sites where you're already signed in stay signed in here. macOS will ask
 * for Keychain access to the other browser's encryption key — nothing is
 * imported until you allow it.
 */
export function ImportLoginsDialog({ open, onClose, onImported }: {
  open: boolean
  onClose(): void
  onImported(): void
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!open) return
    setState({ kind: 'loading' })
    window.importer?.detect()
      .then((sources) => setState({ kind: 'ready', sources }))
      .catch(() => setState({ kind: 'ready', sources: [] }))
  }, [open ])

  const run = async (source: DetectedSource) => {
    if (!window.importer) return setState({ kind: 'error', message: 'Import is only available in the app.' })
    setState({ kind: 'importing', label: source.label })
    try {
      const result = await window.importer.importLogins(source.id)
      if (result.error) return setState({ kind: 'error', message: result.error })
      setState({ kind: 'done', result })
      if (result.imported > 0) onImported()
    } catch {
      setState({ kind: 'error', message: `Import from ${source.label} failed.` })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} label="Import logins">
      <div className="px-4 pb-4 pt-1">
        <p className="text-xs leading-5 text-white/50">
          Copies the cookies that keep you signed in — not saved passwords. macOS will ask for Keychain
          access to the other browser's encryption key. Some sites store sign-in in local storage instead
          of cookies; those will still ask you to log in.
        </p>

        {state.kind === 'loading' && <p className="mt-4 text-xs text-white/40">Looking for browsers</p>}

        {state.kind === 'ready' && (state.sources.length === 0 ? (
          <p className="mt-4 text-xs text-white/40">No Chrome, Chromium, Brave, Edge, or Arc profile found on this Mac.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {state.sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 rounded-[6px] p-2 transition-colors hover:bg-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white">{s.label}</div>
                  <div className="text-2xs text-white/40">
                    {s.profiles.length} profile{s.profiles.length === 1 ? '' : 's'}: {s.profiles.join(', ')}
                  </div>
                </div>
                <Button onClick={() => run(s)}>
                  Import logins
                </Button>
              </li>
            ))}
          </ul>
        ))}

        {state.kind === 'importing' && (
          <p className="mt-4 text-xs text-white/40">Importing from {state.label} — allow the Keychain prompt if it appears</p>
        )}

        {state.kind === 'done' && (
          <p className="mt-4 text-xs leading-5 text-white/70">
            Imported {state.result.imported} of {state.result.found} cookies from {state.result.label}
            {state.result.skipped > 0 && <> ({state.result.skipped} expired/unreadable skipped)</>}
            {state.result.failed > 0 && <> ({state.result.failed} rejected)</>}.
            Already-open tabs were reloaded so sites pick up your logins.
          </p>
        )}

        {state.kind === 'error' && <p className="mt-4 text-xs leading-5 text-red-300">{state.message}</p>}
      </div>
    </Dialog>
  )
}
