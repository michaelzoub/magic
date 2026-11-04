# Magic

A lightweight, intent-driven browser that adapts to what you're working on.

An AI agent understands your browsing context, automatically organizes your tabs, and keeps a recoverable workspace for each activity. Switching between studying, coding, and research becomes as seamless as switching between apps — without ever losing your place.

## The idea

Most browsers organize tabs. Magic organizes *activities*.

Each workspace has a name and a goal — "Study for finals," "Ship the launch," "Plan the trip" — and remembers exactly which tabs belong to it. Open a workspace and its tabs come back, just as you left them. Wander into something else, and Magic notices, tidies up, and keeps a checkpoint so you can return to any earlier moment from Memory.

## Design & engineering decisions

- **The workspace, not the tab, is the basic unit.** Tabs are grouped by what you're trying to do, and each workspace saves its own tab set. Switching replaces the open tabs with the target workspace's — never a merge — so each activity stays clean and predictable (`core/workspaces/switchboard.ts:52`).
- **Nothing is lost by design.** Before the agent reorganizes anything, the current tabs are saved as a restorable checkpoint (`core/memory/state.ts:107`). Workspaces, tabs, and switch history are stored locally in SQLite, so everything survives a restart (`main/db/workspace-db.ts:136`).
- **The agent helps, but never blocks you.** It works in the background and can be paused; if it's unavailable, switching workspaces still works. You can exclude specific sites or workspaces, and excluded tabs are never shown to the agent (`main/agent/host.ts:113`).
- **Parts are kept small and replaceable.** Browsing, workspaces, memory, and the agent are separate pieces with narrow connections between them. The agent's tools don't depend on a particular AI model or framework, so either can be swapped without rebuilding the browser (`agent/lib/tools/ports.ts:1`, `agent/README.md:98`).

## For developers

```bash
npm run dev        # run the app
npm test           # run tests
npm run typecheck  # check types
```

Source layout: `main/` (Electron shell), `renderer/` (UI), `core/` (workspaces, memory, onboarding — no UI or Electron), `agent/` (the AI agent), `shared/` (contracts between processes). See `agent/README.md` for how the agent is wired.
