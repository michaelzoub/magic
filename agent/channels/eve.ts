import { eveChannel } from 'eve/channels/eve'
import { localDev, verifyHttpBasic, type AuthFn } from 'eve/channels/auth'

/**
 * Route auth for the agent's HTTP API.
 *
 * Packaged builds run the production Eve server (`.output/`), which rejects
 * every request unless an authenticator accepts it. The Electron host
 * (`main/agent/host.ts`) mints a random secret per launch, passes it to the
 * server as `MAGIC_EVE_TOKEN`, and sends it back as Basic auth — so only
 * the app that spawned the server can drive it. `localDev()` keeps a
 * standalone `eve dev` session working without the secret.
 */
const MAGIC_EVE_USERNAME = 'magic'

const magicHost: AuthFn<Request> = (request) => {
  const password = process.env.MAGIC_EVE_TOKEN
  if (!password) return null
  const result = verifyHttpBasic(request.headers.get('authorization'), { username: MAGIC_EVE_USERNAME, password })
  return result.ok ? result.sessionAuth : null
}

export default eveChannel({ auth: [magicHost, localDev()] })
