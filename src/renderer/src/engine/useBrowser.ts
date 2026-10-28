import { useEffect, useState } from 'react'
import type { EngineSnapshot } from '@shared/engine'
import { engine } from '.'

export function useBrowser() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>({ tabs: [], activeTabId: null })

  useEffect(() => {
    const off = engine.subscribe(setSnapshot)
    engine.getSnapshot().then(setSnapshot)
    return off
  }, [])

  const activeTab = snapshot.tabs.find((t) => t.id === snapshot.activeTabId) ?? null
  return { ...snapshot, activeTab, engine }
}
