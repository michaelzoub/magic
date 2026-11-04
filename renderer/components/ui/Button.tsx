import type { ButtonHTMLAttributes } from 'react'

/**
 * The one button look. Default height is 28px (`sm`); `md` is the 32px
 * ceiling, reserved for a dialog's primary action. Radius is always 6px
 * and icons are normalised to 14px, so callers pass only layout classes
 * (e.g. `ml-auto`) via `className` — never their own height/padding.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'light' | 'chromeGhost'
export type ButtonSize = 'sm' | 'md'

const variants: Record<ButtonVariant, string> = {
  /** Strong action on dark surfaces. */
  primary: 'bg-white text-black hover:bg-white/85 focus-visible:ring-white/60',
  /** Quiet filled action on dark surfaces. */
  secondary: 'bg-white/[0.08] text-white hover:bg-white/[0.14] focus-visible:ring-white/30',
  /** Text-only action on dark surfaces. */
  ghost: 'text-white/55 hover:bg-white/[0.06] hover:text-white/85 focus-visible:ring-white/30',
  /** Strong action on light surfaces. */
  dark: 'bg-neutral-900 text-white hover:bg-neutral-700 focus-visible:ring-neutral-400',
  /** Quiet filled action on light surfaces. */
  light: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:ring-neutral-400',
  /** Text-only action on browser chrome. */
  chromeGhost: 'text-chrome-muted hover:bg-chrome-hover/[0.05] hover:text-chrome-text focus-visible:ring-chrome-faint'
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5',
  md: 'h-8 px-3'
}

export const buttonClasses = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'sm') =>
  `no-drag inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] text-xs font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0 ${variants[variant]} ${sizes[size]}`

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant, size, className = '', type = 'button', ...props }: Props) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />
}
