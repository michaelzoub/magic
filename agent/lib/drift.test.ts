import { describe, expect, it } from 'vitest'
import { buildDriftPrompt, extractDriftVerdicts } from './drift'

const request = {
  workspace: { id: 'work', name: 'Work', goal: 'Get work projects done' },
  tabs: [
    { id: 't1', title: 'Funny cats', url: 'https://youtube.com/watch?v=1' },
    { id: 't2', title: 'Project board', url: 'https://github.com/acme' }
  ]
}

describe('buildDriftPrompt', () => {
  it('asks the model to judge each tab and reply with only the verdict line', () => {
    const prompt = buildDriftPrompt(request)
    expect(prompt).toContain('"Work"')
    expect(prompt).toContain('Get work projects done')
    expect(prompt).toContain('[t1] Funny cats — https://youtube.com/watch?v=1')
    expect(prompt).toContain('DRIFT_VERDICT:')
    expect(prompt).toContain('When in doubt, "unknown"')
  })
})

describe('extractDriftVerdicts', () => {
  it('parses per-tab verdicts for the requested tabs only', () => {
    const verdicts = extractDriftVerdicts(
      'DRIFT_VERDICT: {"verdicts":[{"tabId":"t1","verdict":"unrelated","reason":"Entertainment"},{"tabId":"t2","verdict":"related","reason":"Project work"},{"tabId":"nope","verdict":"unrelated","reason":"?"}]}',
      ['t1', 't2']
    )
    expect(verdicts).toEqual([
      { tabId: 't1', verdict: 'unrelated', reason: 'Entertainment' },
      { tabId: 't2', verdict: 'related', reason: 'Project work' }
    ])
  })

  it('drops invalid verdict values and duplicate tab entries', () => {
    const verdicts = extractDriftVerdicts(
      'DRIFT_VERDICT: {"verdicts":[{"tabId":"t1","verdict":"maybe","reason":"?"},{"tabId":"t2","verdict":"unknown","reason":"Vague"},{"tabId":"t2","verdict":"related","reason":"dup"}]}',
      ['t1', 't2']
    )
    expect(verdicts).toEqual([{ tabId: 't2', verdict: 'unknown', reason: 'Vague' }])
  })

  it('accepts a bare JSON reply without the marker', () => {
    expect(extractDriftVerdicts('{"verdicts":[{"tabId":"t1","verdict":"unrelated","reason":"Cats"}]}', ['t1'])).toEqual([
      { tabId: 't1', verdict: 'unrelated', reason: 'Cats' }
    ])
  })

  it('returns no verdicts (all unknown) when the model did not judge', () => {
    expect(extractDriftVerdicts('No verdict here.', ['t1'])).toEqual([])
    expect(extractDriftVerdicts('DRIFT_VERDICT: maybe', ['t1'])).toEqual([])
    expect(extractDriftVerdicts(null, ['t1'])).toEqual([])
  })
})
