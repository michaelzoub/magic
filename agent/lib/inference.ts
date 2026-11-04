import { generateText, type LanguageModel } from 'ai'
import { resolveInferenceModel } from './model'

/**
 * Bare inference: one model call and back. No Eve server, no session, no
 * instructions file, no tools, no agent loop, reasoning pinned to the
 * minimum and output capped — this is the fast path for judgments that
 * need to feel instant (goal drift), where booting/running the agent
 * would cost orders of magnitude more time than the judgment itself.
 */
export interface InferenceClient {
  /** Stable id, surfaced in results/logs (e.g. `inference:muse-spark-1.3`). */
  readonly id: string
  /** One prompt in, the model's raw text out (null when it produced none). Never streams. */
  complete(prompt: string, opts?: { signal?: AbortSignal }): Promise<string | null>
}

export function createInferenceClient(): InferenceClient {
  const model = resolveInferenceModel()
  const modelId = typeof model === 'string' ? model : model.modelId
  return {
    id: `inference:${modelId}`,
    async complete(prompt, opts) {
      const { text } = await generateText({
        // EveLanguageModel is the AI SDK model type under Eve's alias; the cast bridges the two declarations.
        model: model as LanguageModel,
        prompt,
        temperature: 0,
        // Muse Spark spends hidden reasoning tokens from this same budget
        // (~140 even at minimal) before any text; 160 truncated the verdict
        // JSON mid-stream and it parsed as "no judgment". 512 leaves room.
        maxOutputTokens: 512,
        reasoning: 'minimal',
        maxRetries: 0,
        abortSignal: opts?.signal
      })
      return text.trim() || null
    }
  }
}
