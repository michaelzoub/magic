/**
 * Builds the agent's production Eve server into `.output/` for packaging.
 *
 * Runs Eve under Electron-as-Node so the build always uses the same Node
 * (24, which Eve requires) the packaged app will run it with, whatever
 * `node` is on PATH. electron-builder then ships `.output/` as the
 * `agent` resource (see electron-builder.yml and main/index.ts).
 *
 * `--skip-sandbox-prewarm`: the agent has no sandbox tools (see
 * agent/tools/bash.ts), so there is no sandbox template to prepare.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const electron = createRequire(import.meta.url)('electron')
const eve = fileURLToPath(new URL('../node_modules/eve/bin/eve.js', import.meta.url))

const result = spawnSync(electron, [eve, 'build', '--skip-sandbox-prewarm'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(result.status ?? 1)
