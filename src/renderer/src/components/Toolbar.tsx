import type { TabState } from '@shared/engine'
import { ChevronLeft, ChevronRight, Close, Reload } from './icons'
import { IconButton } from './IconButton'
import { UrlBar } from './UrlBar'
import { LoadingBar } from './LoadingBar'

interface Props {
  tab: TabState | null
  onBack(): void
  onForward(): void
  onReload(): void
  onStop(): void
  onNavigate(input: string): void
  onPreconnect(input: string): void
}

export function Toolbar({ tab, onBack, onForward, onReload, onStop, onNavigate, onPreconnect }: Props) {
  return (
    <div className="relative mb-1.5 flex h-8 items-center gap-0.5">
      <LoadingBar loading={!!tab?.isLoading} />
      <IconButton tip="Back" tipSide="top" disabled={!tab?.canGoBack} onClick={onBack}><ChevronLeft /></IconButton>
      <IconButton tip="Forward" tipSide="top" disabled={!tab?.canGoForward} onClick={onForward}><ChevronRight /></IconButton>
      {tab?.isLoading ? (
        <IconButton tip="Stop" tipSide="top" onClick={onStop}><Close className="h-3.5 w-3.5" /></IconButton>
      ) : (
        <IconButton tip="Reload" shortcut="⌘R" tipSide="top" disabled={!tab?.url} onClick={onReload}><Reload className="h-3.5 w-3.5" /></IconButton>
      )}
      <div className="ml-1.5 flex min-w-0 flex-1">
        <UrlBar url={tab?.url ?? ''} onSubmit={onNavigate} onPreconnect={onPreconnect} />
      </div>
    </div>
  )
}
