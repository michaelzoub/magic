import { useEffect, useRef, useState } from 'react'
import { Lock, Search } from '../ui/icons'

interface Props {
  url: string
  onSubmit(input: string): void
  onPreconnect(input: string): void
}

const display = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

export function UrlBar({ url, onSubmit, onPreconnect }: Props) {
  const [value, setValue] = useState(url)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const preconnectTimer = useRef<number>(0)

  useEffect(() => {
    if (!focused) setValue(url)
  }, [url, focused])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'l') {
        e.preventDefault()
        ref.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const secure = url.startsWith('https://')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value)
        ref.current?.blur()
      }}
      className={`no-drag flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] bg-chrome-panel px-2.5 transition-[background-color,box-shadow] duration-100 hover:bg-chrome-bg
        ${focused ? 'shadow-[0_0_0_2px_rgb(var(--chrome-focus)/0.45)]' : ''}`}
    >
      {secure && !focused ? <Lock className="h-3.5 w-3.5 shrink-0 text-chrome-faint" /> : <Search className="h-3.5 w-3.5 shrink-0 text-chrome-faint" />}
      <input
        ref={ref}
        value={focused ? value : display(value)}
        onInput={(e) => {
          const next = e.currentTarget.value
          setValue(next)
          clearTimeout(preconnectTimer.current)
          preconnectTimer.current = window.setTimeout(() => onPreconnect(next), 250)
        }}
        onFocus={(e) => {
          setFocused(true)
          const input = e.currentTarget
          requestAnimationFrame(() => input.select())
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Escape' && (setValue(url), ref.current?.blur())}
        placeholder="Search or enter address"
        spellcheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm text-chrome-text outline-none placeholder:text-chrome-faint"
      />
      {!focused && (
        <kbd className="shrink-0 font-sans text-2xs text-chrome-faint">⌘ L</kbd>
      )}
    </form>
  )
}
