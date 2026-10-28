import type { ReactNode, SVGProps } from 'react'

const base = (d: ReactNode) => (p: SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}
    strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>
)

export const ChevronLeft = base(<path d="M10 3.5 5.5 8l4.5 4.5" />)
export const ChevronRight = base(<path d="M6 3.5 10.5 8 6 12.5" />)
export const Reload = base(<><path d="M13 8a5 5 0 1 1-1.46-3.54" /><path d="M13 2.5v3h-3" /></>)
export const Close = base(<path d="m4.5 4.5 7 7m0-7-7 7" />)
export const Plus = base(<path d="M8 3.5v9M3.5 8h9" />)
export const Lock = base(<><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>)
export const Search = base(<><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></>)
export const Globe = base(<><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.6 1.6 2.3 3.4 2.3 5.5S9.6 11.9 8 13.5C6.4 11.9 5.7 10.1 5.7 8S6.4 4.1 8 2.5Z" /></>)
export const Workspaces = base(<><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2" /><rect x="9" y="9" width="4.5" height="4.5" rx="1.2" /></>)
export const SidebarIcon = base(<><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3v10" /></>)
