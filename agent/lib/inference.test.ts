import { describe, expect, it, vi } from 'vitest'

const generateText = vi.fn(async (_opts: Record<string, unknown>) => ({ text: ' DRIFT_VERDICT: {} ' }))
vi.mock('ai', () => ({ generateText }))

const { createInferenceClient } = await import('./inference')

describe('createInferenceClient', () => {
  it('makes one non-thinking, no-retry generateText call and returns its trimmed text', async () => {
    const client = createInferenceClient()
    expect(client.id).toMatch(/^inference:/)
    await expect(client.complete('judge this')).resolves.toBe('DRIFT_VERDICT: {}')
    expect(generateText).toHaveBeenCalledOnce()
    expect(generateText.mock.calls[0][0]).toMatchObject({
      prompt: 'judge this',
      temperature: 0,
      maxOutputTokens: 512,
      reasoning: 'minimal',
      maxRetries: 0
    })
    // No agent machinery: no tools, no instructions, no session.
    expect(generateText.mock.calls[0][0]).not.toHaveProperty('tools')
    expect(generateText.mock.calls[0][0]).not.toHaveProperty('instructions')
  })
})
