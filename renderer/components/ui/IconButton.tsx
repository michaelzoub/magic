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
      className={`no-drag grid h-7 w-7 place-items-center rounded-[6px] text-chrome-text/70 transition-colors duration-100 [&_svg]:size-3.5
        hover:bg-chrome-hover/[0.05] hover:text-chrome-text active:bg-chrome-hover/[0.08]
        disabled:pointer-events-none disabled:opacity-30 ${className}`}
      {...props}
    />
  )
  return tip ? <Tooltip label={tip} shortcut={shortcut} side={tipSide}>{button}</Tooltip> : button
}
