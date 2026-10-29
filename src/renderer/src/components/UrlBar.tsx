import { useEffect, useRef, useState } from 'react'
import { Lock, Search } from './icons'

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
      className={`no-drag flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 transition-[background-color,box-shadow] duration-100
        ${focused
          ? 'bg-chrome-panel shadow-[0_0_0_1px_rgb(94_106_210/0.55),0_0_0_3.5px_rgb(94_106_210/0.12)]'
          : 'bg-chrome-hover/[0.04] hover:bg-chrome-hover/[0.06]'}`}
    >
      {secure && !focused ? <Lock className="h-3 w-3 shrink-0 text-chrome-faint" /> : <Search className="h-3 w-3 shrink-0 text-chrome-faint" />}
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
        className="min-w-0 flex-1 bg-transparent text-xs text-chrome-text outline-none placeholder:text-chrome-faint"
      />
    </form>
  )
}
