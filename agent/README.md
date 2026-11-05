# Magic agent (Eve)

An [Eve](https://eve.dev) agent whose tools drive the Magic browser.
Eve is deliberately a thin shell here: everything reusable lives behind
runtime-agnostic seams so the agent runtime can be swapped without
rewriting tools, instructions, or app code.

## Layout

| Path | Role |
| --- | --- |
| `agent.ts` | Eve config only: model + reasoning. No provider logic. |
| `instructions.md` | System prompt. Runtime-agnostic wording. |
| `tools/*.ts` | One file per tool (Eve names tools by filename). Each is a one-line `toEveTool(<definition>)` re-export. |
| `lib/tools/` | **The core.** Runtime-agnostic tool definitions, Zod schemas, registry, and `ports.ts` (`BrowserEngine`/`PageDriver` injection). No Eve, no Electron. |
| `lib/model.ts` | **Provider seam.** Resolves the language model; the only file that knows about Meta/AI Gateway. |
| `lib/eve/` | Eve adapters: `tool.ts` (`toEveTool`) and `context.ts` (host `ToolContext` bridge). |
| `lib/runtime/` | **Runtime seam.** `AgentRuntime` interface app code depends on; `eve-client.ts` implements it over `eve/client`. |

## Model: Meta Muse Spark

Default is `muse-spark-1.3` (Standard mode, 1M context) called directly
through the Meta Model API (`https://api.meta.ai/v1`, OpenAI-compatible).

```bash
cp ../.env.example ../.env   # then set MODEL_API_KEY
```

Overrides (see `lib/model.ts`): `AGENT_MODEL_ID`,
`AGENT_MODEL_PROVIDER=gateway` (route the id through Vercel AI Gateway),
`META_MODEL_API_BASE_URL`.

## Run

Requires Node ≥ 24 (Eve's requirement; the Electron app itself does not
run this process).

```bash
npm run agent:info   # verify discovery: model, tools, diagnostics
npm run agent:dev    # Eve dev server + terminal UI (default http://127.0.0.1:2000)
npm run agent:build  # production build
```

App code talks to the running agent only through `lib/runtime`:

```ts
import { createAgentRuntime } from './lib/runtime'
const runtime = createAgentRuntime() // AGENT_RUNTIME=eve, EVE_AGENT_URL=<url>
const { reply, sessionId } = await runtime.send('Open example.com and summarize it')
```

## Embedded mode: MagicPopover chatbox

Every question submitted in the MagicPopover chatbox is sent to the agent:
`MagicPopoverContent.onAsk` → (native overlay `magic:ask` action, or the
sidebar fallback prop) → `App.askAgent` → `EmbeddedAgent.ask` (preload IPC
`agent:ask`) → `EmbeddedAgentHost.ask`, which builds the prompt with
`lib/chat.ts` (question + active workspace + open tabs, excluded sites
stripped) and runs it through the `AgentRuntime`. The agent thinks, drives
the browser with the `tools/` tools via the tool bridge, and its final
reply is returned and shown in the popover transcript. Chat turns are
serialized, continue one Eve session per window, time out after 120s
(`MAGIC_AGENT_CHAT_TIMEOUT_MS`), and are not gated by background
assistance (that toggle only stops unsolicited restructuring).

## Embedded mode: workspace switches

Inside the Electron app the agent is embedded (`main/agent/host.ts`):
selecting/creating a workspace in the renderer sends a before → after
notice (both workspaces' name + goal, plus outgoing/incoming tabs) over
IPC to the main process, which prompts the agent to set up the new
workspace with its browser tools. Runs are coalesced and fire-and-forget;
a failed/unavailable agent never blocks the switch.

The host starts a per-launch, token-guarded localhost tool bridge
(`main/agent/tool-bridge.ts`) and spawns the Eve server as a child
process (Electron-as-Node 24) with `MAGIC_TOOL_BRIDGE_URL` /
`MAGIC_TOOL_BRIDGE_TOKEN` in its env. Eve-side, `lib/eve/context.ts`
then resolves a proxy `ToolContext` (`lib/eve/bridge-context.ts`), so
tools execute against the live engine. `BrowserStore` is not bridged
(it is synchronous and renderer-owned), so `list_workspaces` /
`switch_workspace` report `unavailable` in embedded mode — the switch
has already happened by the time the agent runs.

Packaged builds don't run `eve dev`: `npm run build:agent` produces the
production server (`.output/`), which ships as `Resources/agent` and runs
with its state under the app's user-data folder. Its routes require a
per-launch secret the host passes as `MAGIC_EVE_TOKEN`
(`agent/channels/eve.ts`). The model key comes from `MODEL_API_KEY`, set by
the host from Settings when the environment has none (`main/model-key.ts`).

Set `EVE_AGENT_URL` to use an externally run Eve server instead of the
spawned one (it must be started with the bridge env itself, or browser
tools report `unavailable`), `EVE_PORT` for the spawned port (default
3217), and `MAGIC_AGENT_ENABLED=0` to disable switch runs.

In a standalone `eve dev` session with no bridge env, browser tools
return a normalized `{ ok: false, error: { code: 'unavailable' } }`
result instead of throwing — the agent runs, and the model can explain
what is not connected.

Live end-to-end test (real Eve + Muse Spark + bridge):
`MAGIC_AGENT_INTEGRATION=1 npx vitest run main/agent/host.integration.test.ts`

## Swapping the runtime

1. Tools/instructions/model: unchanged — they never import Eve.
2. Write a new `AgentRuntime` implementation next to `eve-client.ts`.
3. Add its case to `createAgentRuntime()` (or set the env it reads).
4. Delete `agent.ts` + `tools/` + `lib/eve/` when Eve is fully out.
