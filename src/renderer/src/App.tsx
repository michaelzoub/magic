import { useEffect, useState } from 'react'
import { useBrowser } from '@/engine/useBrowser'
import { RAIL, Sidebar } from '@/components/Sidebar'
import { TabStrip } from '@/components/TabStrip'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'

export function App() {
  const { tabs, activeTabId, activeTab, engine } = useBrowser()
  const id = activeTab?.id
  const [sidebar, setSidebar] = useState(RAIL)
  const [lastOpen, setLastOpen] = useState(208)
  const open = sidebar > RAIL
  const resize = (w: number) => (setSidebar(w), w > RAIL && setLastOpen(w))

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
      <Sidebar width={sidebar} onWidth={resize} onToggle={() => setSidebar(open ? RAIL : lastOpen)} />
      <main className="relative flex min-w-0 flex-1 flex-col pb-2 pr-2">
        <header className="flex h-[44px] items-center" style={{ paddingLeft: Math.max(8, 80 - sidebar) }}>
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={(t) => engine.activateTab(t)}
            onClose={(t) => engine.closeTab(t)}
            onNew={() => engine.createTab()}
          />
        </header>
        <Toolbar
          tab={activeTab}
          onBack={() => id && engine.goBack(id)}
          onForward={() => id && engine.goForward(id)}
          onReload={() => id && engine.reload(id)}
          onStop={() => id && engine.stop(id)}
          onNavigate={(input) => id && engine.navigate(id, input)}
          onPreconnect={(input) => engine.preconnect(input)}
        />
        <Viewport tab={activeTab} />
      </main>
    </div>
  )
}
