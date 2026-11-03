# Source layout

- `main/` — Electron main process (browser shell host). Entry: `main/index.ts`.
  - `browser/` — native engine, page driver, tooltip overlay (`WebContentsView`s).
  - `db/` — SQLite persistence (only place `node:sqlite` is used).
  - `imports/` — Chrome login import (Keychain/crypto, external data).
  - `agent/` — wiring that binds the native engine/page driver to agent tools.
- `preload/` — context bridge exposed to the renderer.
- `renderer/` — Preact UI.
  - `components/ui/` — primitives (Dialog, Popover, Tooltip, IconButton, icons).
  - `components/browser/` — browser chrome (Sidebar, TabStrip, Toolbar, Viewport…).
  - `components/{memory,imports,workspaces}/` — feature dialogs/pickers.
  - `features/onboarding/` — onboarding flow UI + save/load orchestration.
  - `hooks/` — React hooks over the engine/persistence (`useBrowser`, …).
  - `adapters/` — in-memory fallbacks so the UI runs in a plain browser tab.
- `agent/` — the Eve agent (see `agent/README.md`). Eve-facing surface is thin:
  `agent.ts` (runtime config), `instructions.md`, and one re-export file per
  tool in `tools/` (Eve derives tool names from filenames).
  - `lib/tools/` — runtime-agnostic agent tools + registry. No Electron or Eve
    imports; native implementations are injected via `ports.ts` from
    `main/agent/`. This is the hot-swappable core.
  - `lib/model.ts` — the only place provider specifics live (default: Meta
    Muse Spark via the Meta Model API).
  - `lib/eve/` — Eve adapters (`toEveTool`, host `ToolContext` bridge).
  - `lib/runtime/` — framework-agnostic `AgentRuntime` contract app code
    calls, with `eve-client.ts` as its current Eve implementation.
- `core/` — pure domain logic, no Electron/React: `workspaces/`, `memory/`,
  `onboarding/`. Tests are colocated.
- `shared/` — cross-process contracts only: IPC channel names, payload types,
  and the `BrowserEngine` interface all processes agree on. Not a utils dump;
  helpers belong with the code that uses them.

Aliases: `@shared/*`, `@core/*`, `@agent/*`, `@/*` (renderer).
