import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, type InlineToken } from './Markdown'

/** Flatten inline tokens to their visible text (what the reader sees). */
const visible = (tokens: InlineToken[]): string =>
  tokens
    .map((t) => {
      switch (t.type) {
        case 'text':
        case 'code':
          return t.text
        case 'break':
          return '\n'
        default:
          return visible(t.children)
      }
    })
    .join('')

// The agent reply from the bug report, verbatim in structure.
const SAMPLE = [
  'Locked in ✅ Your **Design Inspo** workspace went from 10 → 6 tabs.',
  '',
  '**Kept (on-goal for Cosmos / X / YouTube + Design Inspo):**',
  '- Cosmos — cosmos.so',
  '- Element / Cosmos —',
  'cosmos.so/e/1152631555',
  '- Home / X — x.com/home',
  '',
  '**Closed (4 + Figma):**',
  '- Figma — judging as building tool, not browsing inspo, breaks focus'
].join('\n')

describe('parseMarkdown — agent reply from the bug report', () => {
  it('renders bold headings and bullet lists instead of raw ** and - markers', () => {
    const blocks = parseMarkdown(SAMPLE)
    const lists = blocks.filter((b) => b.type === 'list')
    expect(lists).toHaveLength(2)
    if (lists[0].type !== 'list' || lists[1].type !== 'list') throw new Error('expected lists')
    expect(lists[0].ordered).toBe(false)
    expect(lists[0].items.map(visible)).toEqual([
      'Cosmos — cosmos.so',
      'Element / Cosmos —\ncosmos.so/e/1152631555',
      'Home / X — x.com/home'
    ])
    expect(lists[1].items.map(visible)).toEqual(['Figma — judging as building tool, not browsing inspo, breaks focus'])
  })

  it('keeps no raw markdown punctuation in the visible text', () => {
    const all = parseMarkdown(SAMPLE)
      .flatMap((b) => ('inline' in b ? [visible(b.inline)] : 'items' in b ? b.items.map(visible) : []))
      .join('\n')
    expect(all).not.toContain('**')
    expect(all).not.toMatch(/^- /m)
    expect(all).toContain('Design Inspo')
    expect(all).toContain('Kept (on-goal for Cosmos / X / YouTube + Design Inspo):')
  })

  it('parses the lead paragraph with an inline bold span', () => {
    const [first] = parseMarkdown(SAMPLE)
    if (first.type !== 'paragraph') throw new Error('expected paragraph')
    const bold = first.inline.find((t) => t.type === 'bold')
    expect(bold && visible([bold])).toBe('Design Inspo')
    expect(visible(first.inline)).toBe('Locked in ✅ Your Design Inspo workspace went from 10 → 6 tabs.')
  })
})

describe('parseInline', () => {
  it('parses code, links, italic and strikethrough', () => {
    const tokens = parseInline('run `organize_tabs` then see [Cosmos](https://cosmos.so) — *nice* ~~old~~')
    expect(tokens.map((t) => t.type)).toEqual(['text', 'code', 'text', 'link', 'text', 'italic', 'text', 'strike'])
    const link = tokens.find((t) => t.type === 'link')
    expect(link?.type === 'link' && link.href).toBe('https://cosmos.so')
  })

  it('leaves unmatched delimiters literal while streaming', () => {
    expect(visible(parseInline('Your **Design Insp'))).toBe('Your **Design Insp')
    expect(visible(parseInline('a `code'))).toBe('a `code')
  })

  it('rejects unsafe link protocols', () => {
    const tokens = parseInline('[click](javascript:alert(1))')
    expect(tokens.some((t) => t.type === 'link')).toBe(false)
  })

  it('does not italicise snake_case identifiers', () => {
    expect(visible(parseInline('call search_tabs_now please'))).toBe('call search_tabs_now please')
    expect(parseInline('call search_tabs_now please').every((t) => t.type === 'text')).toBe(true)
  })
})

describe('parseMarkdown blocks', () => {
  it('parses headings, fences, quotes, ordered lists and tables', () => {
    const blocks = parseMarkdown(
      ['# Plan', '', '```', 'const x = 1', '```', '', '> note', '', '1. one', '2. two', '', '| Tab | Action |', '| --- | --- |', '| Figma | close |'].join('\n')
    )
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'code', 'quote', 'list', 'table'])
    const table = blocks[4]
    if (table.type !== 'table') throw new Error('expected table')
    expect(table.header.map(visible)).toEqual(['Tab', 'Action'])
    expect(table.rows[0].map(visible)).toEqual(['Figma', 'close'])
  })

  it('survives empty and whitespace-only replies', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n  \n')).toEqual([])
  })
})
