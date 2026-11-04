/**
 * Model selection — the only place provider specifics live.
 *
 * Hot-swap contract: `agent/agent.ts` (and any future non-Eve runtime) asks
 * this module for a model. Changing provider/model is an env change or an
 * edit here; instructions, tools, and app code never name a provider.
 *
 * Default: Meta Muse Spark (`muse-spark-1.3`, Standard mode) called directly
 * through the Meta Model API, which is OpenAI-compatible:
 *   base URL https://api.meta.ai/v1, key in `MODEL_API_KEY`.
 * Set `AGENT_MODEL_PROVIDER=gateway` to instead return the model id string
 * and let Eve route it through the Vercel AI Gateway.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EveLanguageModel } from 'eve'

export const AGENT_MODEL = {
  /** Meta Model API model id. Override with `AGENT_MODEL_ID`. */
  id: process.env.AGENT_MODEL_ID ?? 'muse-spark-1.3',
  /** Muse Spark context window (all 1.x versions). */
  contextWindowTokens: 1_048_576
} as const

export type AgentModelProvider = 'meta' | 'gateway'

export function agentModelProvider(): AgentModelProvider {
  return process.env.AGENT_MODEL_PROVIDER === 'gateway' ? 'gateway' : 'meta'
}

/**
 * Returns what Eve's `defineAgent({ model })` accepts: a language-model
 * instance for direct providers, or a model-id string for the AI Gateway.
 * A missing `MODEL_API_KEY` does not throw here; the provider call fails at
 * request time with its own auth error, so `eve info` still works keyless.
 */
function resolveModel(modelId: string): EveLanguageModel | string {
  if (agentModelProvider() === 'gateway') return modelId

  const meta = createOpenAICompatible({
    name: 'meta',
    baseURL: process.env.META_MODEL_API_BASE_URL ?? 'https://api.meta.ai/v1',
    apiKey: process.env.MODEL_API_KEY,
    includeUsage: true
  })
  return meta(modelId)
}

export function resolveAgentModel(): EveLanguageModel | string {
  return resolveModel(AGENT_MODEL.id)
}

/**
 * Model for bare inference calls (no agent loop): the agent model by
 * default, overridable with `DRIFT_MODEL_ID` to point drift judgment at a
 * smaller/faster model without touching the agent's model.
 */
export function resolveInferenceModel(): EveLanguageModel | string {
  return resolveModel(process.env.DRIFT_MODEL_ID ?? AGENT_MODEL.id)
}
