import { defineAgent } from 'eve'
import { AGENT_MODEL, resolveAgentModel } from './lib/model'

// Eve runtime config only. Model/provider selection lives in
// `lib/model.ts` so swapping providers (or runtimes) never touches this file's logic.
export default defineAgent({
  model: resolveAgentModel(),
  modelContextWindowTokens: AGENT_MODEL.contextWindowTokens,
  reasoning: 'low'
})
