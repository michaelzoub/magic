import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'

/**
 * Minimal, safe Markdown rendering for agent replies in the chat.
 *
 * The agent answers in Markdown (`**bold**` headings, `-` lists, links,
 * code), but the chat used to print that source verbatim — asterisks and
 * dashes included. This renders the subset agents actually emit to React
 * nodes (never `dangerouslySetInnerHTML`, so reply text cannot inject
 * markup), and it tolerates streaming: an unclosed `**` or fence mid-turn
 * renders as literal text until its closer arrives.
 */

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'strike'; children: InlineToken[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: InlineToken[] }
  | { type: 'break' }

export type MarkdownBlock =
  | { type: 'paragraph'; inline: InlineToken[] }
  | { type: 'heading'; level: number; inline: InlineToken[] }
  | { type: 'list'; ordered: boolean; items: InlineToken[][] }
  | { type: 'code'; text: string }
  | { type: 'quote'; inline: InlineToken[] }
  | { type: 'table'; header: InlineToken[][]; rows: InlineToken[][][] }
  | { type: 'hr' }

const SAFE_HREF = /^(https?:|mailto:)/i

/** Parse inline spans. Unmatched delimiters stay literal (streaming-safe). */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let buf = ''
  const flush = () => {
    if (buf) tokens.push({ type: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    // Inline code wins over every other span.
    const code = /^`([^`\n]+)`/.exec(rest)
    if (code) {
      flush()
      tokens.push({ type: 'code', text: code[1] })
      i += code[0].length
      continue
    }
    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest)
    if (link && SAFE_HREF.test(link[2])) {
      flush()
      tokens.push({ type: 'link', href: link[2], children: parseInline(link[1]) })
      i += link[0].length
      continue
    }
    const bold = /^\*\*([\s\S]+?)\*\*/.exec(rest) ?? /^__([\s\S]+?)__/.exec(rest)
    if (bold) {
      flush()
      tokens.push({ type: 'bold', children: parseInline(bold[1]) })
      i += bold[0].length
      continue
    }
    const strike = /^~~([\s\S]+?)~~/.exec(rest)
    if (strike) {
      flush()
      tokens.push({ type: 'strike', children: parseInline(strike[1]) })
      i += strike[0].length
      continue
    }
    // Single-* italic; `_` only at word edges so snake_case stays literal.
    const italic =
      /^\*([^*\n]+)\*/.exec(rest) ??
      (i === 0 || /\s/.test(text[i - 1]) ? /^_([^_\n]+)_/.exec(rest) : null)
    if (italic) {
      flush()
      tokens.push({ type: 'italic', children: parseInline(italic[1]) })
      i += italic[0].length
      continue
    }
    if (text[i] === '\n') {
      flush()
      tokens.push({ type: 'break' })
      i += 1
      continue
    }
    buf += text[i]
    i += 1
  }
  flush()
  return tokens
}

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const isTableSeparator = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')
const splitRow = (line: string): InlineToken[][] =>
  line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => parseInline(cell.trim()))

/** Parse block structure: paragraphs, headings, lists, fences, quotes, tables. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const fence = /^```/.test(line.trim())
    if (fence) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // closing fence (or EOF while streaming)
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2].trim()) })
      i += 1
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line)
      const rows: InlineToken[][][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', inline: parseInline(quoted.join('\n')) })
      continue
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: InlineToken[][] = []
      while (i < lines.length) {
        const item = LIST_ITEM.exec(lines[i])
        if (item) {
          items.push(parseInline(item[2]))
          i += 1
          continue
        }
        // Wrapped/continuation lines (e.g. a long URL on the next line)
        // belong to the previous item, not a new paragraph.
        if (lines[i].trim() && items.length > 0 && !/^(#{1,6})\s/.test(lines[i])) {
          const last = items[items.length - 1]
          items[items.length - 1] = [...last, { type: 'break' }, ...parseInline(lines[i].trim())]
          i += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    // Paragraph: consecutive non-blank lines (a list/heading/fence starting
    // mid-paragraph still ends it on the next loop via the blank-line rule
    // of most agent output; soft-wrapped lines join with a break).
    const para: string[] = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i].trim())) {
      para.push(lines[i])
      i += 1
    }
    blocks.push({ type: 'paragraph', inline: parseInline(para.join('\n')) })
  }
  return blocks
}

function renderInline(tokens: InlineToken[], keyPrefix: string): ReactNode[] {
  return tokens.map((t, idx) => {
    const key = `${keyPrefix}-${idx}`
    switch (t.type) {
      case 'text':
        return t.text
      case 'break':
        return <br key={key} />
      case 'code':
        return (
          <code key={key} className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-white/90">
            {t.text}
          </code>
        )
      case 'bold':
        return (
          <strong key={key} className="font-semibold text-white">
            {renderInline(t.children, key)}
          </strong>
        )
      case 'italic':
        return <em key={key}>{renderInline(t.children, key)}</em>
      case 'strike':
        return <s key={key}>{renderInline(t.children, key)}</s>
      case 'link':
        return (
          <a key={key} href={t.href} target="_blank" rel="noreferrer" className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white/70">
            {renderInline(t.children, key)}
          </a>
        )
    }
  })
}

const headingClass = (level: number) =>
  level <= 1
    ? 'mb-1.5 mt-1 text-lg font-semibold text-white first:mt-0'
    : level === 2
      ? 'mb-1.5 mt-2 text-base font-semibold text-white first:mt-0'
      : 'mb-1 mt-2 text-sm font-semibold text-white first:mt-0'

/**
 * Render agent reply text as formatted, readable chat content.
 * Memoized: the chat re-renders on every input keystroke, and re-parsing
 * every reply (regex-heavy) per keystroke made typing visibly laggy as
 * the transcript grew. Props are plain strings, so memo skips cleanly.
 */
export const MarkdownText = memo(function MarkdownText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className={`min-w-0 text-base leading-relaxed text-white/85 [overflow-wrap:anywhere] ${className}`}>
      {blocks.map((b, idx) => {
        const key = `b-${idx}`
        switch (b.type) {
          case 'paragraph':
            return (
              <p key={key} className="mb-2 last:mb-0">
                {renderInline(b.inline, key)}
              </p>
            )
          case 'heading': {
            const Tag = `h${Math.min(b.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6'
            return (
              <Tag key={key} className={headingClass(b.level)}>
                {renderInline(b.inline, key)}
              </Tag>
            )
          }
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul'
            return (
              <Tag key={key} className={`mb-2 space-y-1 pl-5 last:mb-0 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-white/30`}>
                {b.items.map((item, itemIdx) => (
                  <li key={`${key}-${itemIdx}`}>{renderInline(item, `${key}-${itemIdx}`)}</li>
                ))}
              </Tag>
            )
          }
          case 'code':
            return (
              <pre key={key} className="mb-2 overflow-x-auto rounded-lg bg-black/30 p-3 font-mono text-xs leading-relaxed text-white/90 ring-1 ring-white/[0.06] last:mb-0">
                {b.text}
              </pre>
            )
          case 'quote':
            return (
              <blockquote key={key} className="mb-2 rounded-lg bg-white/[0.06] px-3 py-2 text-white/55 last:mb-0">
                {renderInline(b.inline, key)}
              </blockquote>
            )
          case 'table':
            return (
              <div key={key} className="mb-2 overflow-x-auto last:mb-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.06]">
                      {b.header.map((cell, c) => (
                        <th key={c} className="px-2 py-1 text-left font-semibold text-white">
                          {renderInline(cell, `${key}-h${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className={r % 2 ? 'bg-white/[0.04]' : undefined}>
                        {row.map((cell, c) => (
                          <td key={c} className="px-2 py-1 align-top">
                            {renderInline(cell, `${key}-${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'hr':
            return <div key={key} role="separator" className="my-2 h-2" />
        }
      })}
    </div>
  )
})
