import type { ButtonHTMLAttributes } from 'react'
import { Tooltip } from '.'

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
      className={`no-drag grid h-8 w-8 place-items-center rounded-lg text-chrome-text/70 transition-colors duration-100
        hover:bg-chrome-hover/[0.05] hover:text-chrome-text active:bg-chrome-hover/[0.08]
        disabled:pointer-events-none disabled:opacity-30 ${className}`}
      {...props}
    />
  )
  return tip ? <Tooltip label={tip} shortcut={shortcut} side={tipSide}>{button}</Tooltip> : button
}
