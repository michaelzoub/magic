import { useEffect, useRef, useState } from 'react'
import { Lock, Search } from './icons'

interface Props {
  url: string
  onSubmit(input: string): void
}

const display = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

export function UrlBar({ url, onSubmit }: Props) {
  const [value, setValue] = useState(url)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

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
      className={`no-drag flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 transition-colors duration-100
        ${focused
          ? 'border-chrome-border/20 bg-chrome-panel shadow-[0_0_0_3px_rgb(var(--chrome-border)/0.05)]'
          : 'border-chrome-border/[0.07] bg-chrome-hover/[0.03] hover:bg-chrome-hover/[0.05]'}`}
    >
      {secure && !focused ? <Lock className="h-3 w-3 shrink-0 text-chrome-faint" /> : <Search className="h-3 w-3 shrink-0 text-chrome-faint" />}
      <input
        ref={ref}
        value={focused ? value : display(value)}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          setFocused(true)
          requestAnimationFrame(() => e.target.select())
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Escape' && (setValue(url), ref.current?.blur())}
        placeholder="Search or enter address"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-xs text-chrome-text outline-none placeholder:text-chrome-faint"
      />
    </form>
  )
}
