import type { ButtonHTMLAttributes } from 'react'

/**
 * The one button look, project-wide. There is deliberately no size prop:
 * every action button is the same thin 28px height with 6px radius and
 * 14px icons, so paired actions (primary + secondary in a footer or dock)
 * can never mismatch. Callers pass only layout classes (e.g. `ml-auto`,
 * `flex-1`) via `className` — never their own height/padding.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'light' | 'chromeGhost'

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

export const buttonClasses = (variant: ButtonVariant = 'secondary') =>
  `no-drag inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0 ${variants[variant]}`

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}

export function Button({ variant, className = '', type = 'button', ...props }: Props) {
  return <button type={type} className={`${buttonClasses(variant)} ${className}`} {...props} />
}
