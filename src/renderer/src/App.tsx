import { useEffect } from 'react'
import { useBrowser } from '@/engine/useBrowser'
import { Sidebar } from '@/components/Sidebar'
import { TabStrip } from '@/components/TabStrip'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'

export function App() {
  const { tabs, activeTabId, activeTab, engine } = useBrowser()
  const id = activeTab?.id

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.key === 't') (e.preventDefault(), engine.createTab())
      if (e.key === 'w' && id) (e.preventDefault(), engine.closeTab(id))
      if (e.key === 'r' && id) (e.preventDefault(), engine.reload(id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, id])

  return (
    <div className="flex h-full">
      <div className="drag absolute inset-x-0 top-0 h-[44px]" />
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col pb-2 pr-2">
        <header className="flex h-[44px] items-center pl-[28px] pr-1">
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={(t) => engine.activateTab(t)}
            onClose={(t) => engine.closeTab(t)}
            onNew={() => engine.createTab()}
          />
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-chrome-border/[0.08] bg-chrome-panel/60">
          <Toolbar
            tab={activeTab}
            onBack={() => id && engine.goBack(id)}
            onForward={() => id && engine.goForward(id)}
            onReload={() => id && engine.reload(id)}
            onStop={() => id && engine.stop(id)}
            onNavigate={(input) => id && engine.navigate(id, input)}
          />
          <div className="flex min-h-0 flex-1 px-1 pb-1">
            <Viewport tab={activeTab} />
          </div>
        </div>
      </main>
    </div>
  )
}
