/**
 * Host bridge for Eve tools.
 *
 * Eve tool files run inside the Eve server process, while the browser
 * engine lives in the Electron main process — so Eve tools cannot import
 * a `ToolContext` directly. The host injects one here (in-process hosting,
 * tests) via `setToolContext`, or a future HTTP bridge can resolve one
 * from `MAGIC_TOOL_BRIDGE_URL`. Until a context is injected, every
 * browser tool returns a normalized `unavailable` result instead of
 * throwing, so `eve dev` still runs and the model can say what is missing.
 */
import type { ToolContext } from '../tools/ports'
import { createBridgeToolContext } from './bridge-context'

let current: ToolContext | null = null
let bridge: ToolContext | null = null

export function setToolContext(ctx: ToolContext | null): void {
  current = ctx
}

export function getToolContext(): ToolContext | null {
  if (current) return current
  const url = process.env.MAGIC_TOOL_BRIDGE_URL
  if (!url) return null
  // The host (Electron main) sets the bridge env when it spawns the Eve
  // server; the context is created once and proxies calls back to it.
  bridge ??= createBridgeToolContext(url, process.env.MAGIC_TOOL_BRIDGE_TOKEN)
  return bridge
}
