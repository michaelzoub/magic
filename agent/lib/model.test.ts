import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('resolveAgentModel', () => {
  it('defaults to Meta Muse Spark 1.3 with a 1M context window', async () => {
    const { AGENT_MODEL, resolveAgentModel } = await import('./model')
    expect(AGENT_MODEL.id).toBe('muse-spark-1.3')
    expect(AGENT_MODEL.contextWindowTokens).toBe(1_048_576)
    const model = resolveAgentModel()
    expect(typeof model).not.toBe('string')
    expect((model as { modelId: string }).modelId).toBe('muse-spark-1.3')
  })

  it('returns a gateway model-id string when AGENT_MODEL_PROVIDER=gateway', async () => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'gateway')
    const { resolveAgentModel } = await import('./model')
    expect(resolveAgentModel()).toBe('muse-spark-1.3')
  })
})
