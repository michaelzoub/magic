import { useEffect, useState } from 'react'
import { MODEL_KEY_URL, type ModelKeyBridge, type ModelKeyStatus } from '@shared/model-key'
import { Button } from '@/components/ui'

declare global {
  interface Window {
    modelKey?: ModelKeyBridge
  }
}

const field =
  'w-full rounded-[6px] bg-white/[0.05] px-2.5 py-1.5 font-mono text-sm text-white outline-none transition-colors placeholder:font-sans placeholder:text-white/30 focus:bg-white/[0.08] focus:ring-1 focus:ring-white/40'

/** Strip Electron's "Error invoking remote method 'x': Error:" wrapper from IPC errors. */
const ipcMessage = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') : String(e)

/**
 * The agent's Meta Model API key. The key goes to main once and never
 * comes back: this section only sees whether one is set and its last four
 * characters. Saving restarts the agent with the new key.
 */
export function ModelKeySection() {
  const bridge = window.modelKey
  const [status, setStatus] = useState<ModelKeyStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void bridge?.status().then((s) => {
      setStatus(s)
      if (!s.configured) setEditing(true)
    })
  }, [bridge])

  if (!bridge || !status) return null

  const run = async (op: () => Promise<ModelKeyStatus>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await op()
      setStatus(next)
      setDraft('')
      setEditing(!next.configured)
    } catch (e) {
      setError(ipcMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Model API key">
      <h3 className="text-xs font-medium text-white/45">Model API key</h3>
      {editing ? (
        <form
          className="mt-2 flex max-w-[520px] gap-1.5"
          onSubmit={(e) => (e.preventDefault(), void run(() => bridge.set(draft)))}
        >
          <input
            type="password"
            autoComplete="off"
            spellcheck={false}
            aria-label="Meta Model API key"
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
            placeholder="Paste your Meta Model API key"
            className={field}
          />
          <Button type="submit" variant="primary" disabled={busy || !draft.trim()}>
            {busy ? 'Saving' : 'Save'}
          </Button>
          {status.configured && (
            <Button variant="ghost" disabled={busy} onClick={() => (setEditing(false), setDraft(''), setError(null))}>
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="text-white/70">
            Key ending in <span className="font-mono">{status.hint}</span>
          </span>
          {status.source === 'env' ? (
            <span className="text-xs text-white/35">from MODEL_API_KEY in the environment</span>
          ) : (
            <span className="flex gap-1">
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
                Replace
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void run(() => bridge.clear())}>
                Remove
              </Button>
            </span>
          )}
        </div>
      )}
      <p className="mt-1.5 max-w-[58ch] text-xs leading-relaxed text-white/40" role={error ? 'alert' : undefined}>
        {error ? (
          <span className="text-red-300">{error}</span>
        ) : status.configured ? (
          'Magic uses this key to run its agent. It is encrypted with your system keychain and never leaves this device except to call the model.'
        ) : (
          `Magic needs a Meta Model API key to organize tabs and answer questions. Create one at ${MODEL_KEY_URL.replace('https://', '')}.`
        )}
      </p>
    </section>
  )
}
