/**
 * Shared look for every floating surface — popups, dropdowns, menus,
 * tooltips, and dialogs. Rule: they always have a dark charcoal background
 * (neutral-800, softer than pure black).
 *
 * Enforcement: components in this folder must compose `surface` instead of
 * setting their own background, and new features must import these
 * components (Popover, Dialog, Tooltip, MenuItem…) rather than rolling
 * their own floating UI. Checked by `surface.test.ts`.
 */
export const surface =
  'bg-neutral-800 text-white shadow-[0_4px_16px_rgb(0_0_0/0.35)]'
