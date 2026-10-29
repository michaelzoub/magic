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
export const Memory = base(<><path d="M8 2.5c-2.2 0-3.8 1.4-3.8 3.3 0 .5.1.9.3 1.3A2.6 2.6 0 0 0 3.5 9.3c0 1.3 1 2.4 2.3 2.5.3 1 1.2 1.7 2.2 1.7s1.9-.7 2.2-1.7c1.3-.1 2.3-1.2 2.3-2.5 0-.9-.4-1.7-1-2.2.2-.4.3-.8.3-1.3 0-1.9-1.6-3.3-3.8-3.3Z" /><path d="M8 4.5v9" /></>)
export const Settings = base(<><path d="M6.9 1.9h2.2l.35 1.6c.4.15.78.37 1.12.64l1.56-.5 1.1 1.9-1.21 1.1a4.6 4.6 0 0 1 0 1.3l1.21 1.1-1.1 1.9-1.56-.5c-.34.27-.72.49-1.12.64l-.35 1.6H6.9l-.35-1.6a4.4 4.4 0 0 1-1.12-.64l-1.56.5-1.1-1.9 1.21-1.1a4.6 4.6 0 0 1 0-1.3l-1.21-1.1 1.1-1.9 1.56.5c.34-.27.72-.49 1.12-.64Z" /><circle cx="8" cy="8" r="1.8" /></>)
export const Layers = base(<><path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5Z" /><path d="m2.5 8.25 5.5 3 5.5-3" /><path d="m2.5 10.75 5.5 3 5.5-3" opacity=".55" /></>)
export const Check = base(<path d="m3.5 8.5 3 3 6-7" />)
export const User = base(<><circle cx="8" cy="5.5" r="2.5" /><path d="M3.5 13.5c.6-2.3 2.4-3.5 4.5-3.5s3.9 1.2 4.5 3.5" /></>)
export const Briefcase = base(<><rect x="2.5" y="5" width="11" height="8" rx="1.5" /><path d="M6 5V3.8c0-.4.3-.8.8-.8h2.4c.5 0 .8.4.8.8V5M2.5 8.5h11" /></>)
export const GradCap = base(<><path d="M8 3 1.5 6 8 9l6.5-3Z" /><path d="M4.5 7.5v3c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5v-3" /></>)
export const ChevronUpDown = base(<path d="m5.5 6 2.5-2.5L10.5 6m-5 4 2.5 2.5 2.5-2.5" />)
