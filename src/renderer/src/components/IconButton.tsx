import type { ButtonHTMLAttributes } from 'react'
import { Tooltip } from './ui'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tip?: string
  shortcut?: string
  tipSide?: 'top' | 'right' | 'bottom'
}

export function IconButton({ className = '', tip, shortcut, tipSide = 'bottom', ...props }: Props) {
  const button = (
    <button
      type="button"
      aria-label={tip}
      className={`no-drag grid h-7 w-7 place-items-center rounded-md text-chrome-muted transition-colors duration-100
        hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.09]
        disabled:pointer-events-none disabled:opacity-30 ${className}`}
      {...props}
    />
  )
  return tip ? <Tooltip label={tip} shortcut={shortcut} side={tipSide}>{button}</Tooltip> : button
}
