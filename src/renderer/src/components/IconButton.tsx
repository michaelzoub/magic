import type { ButtonHTMLAttributes } from 'react'

export function IconButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`no-drag grid h-7 w-7 place-items-center rounded-md text-chrome-muted transition-colors duration-100
        hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.1]
        disabled:pointer-events-none disabled:opacity-35 ${className}`}
      {...props}
    />
  )
}
