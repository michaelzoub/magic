import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('./MagicPopover.tsx', import.meta.url), 'utf8')
const overlay = readFileSync(new URL('../../overlay/OverlayApp.tsx', import.meta.url), 'utf8')
const shared = readFileSync(new URL('../../../shared/overlay.ts', import.meta.url), 'utf8')

describe('Magic chat', () => {
  it('shows suggested prompts only in the empty state, sent like typed messages', () => {
    expect(src).toContain('function SuggestionRow')
    expect(src).toContain('Organize my tabs')
    expect(src).toContain('Help me find a tab')
    expect(src).toContain('onClick={() => void sendMessage(action.prompt)}')
    // Gated on the empty conversation: sending anything hides them.
    expect(src).toContain('{isEmptyConversation && !showExclusions && !showResume && (')
  })

  it('has no Recent activity anywhere', () => {
    expect(src).not.toContain('Recent activity')
    expect(src).not.toContain('showActivity')
  })

  it('uses the user pixel totem, not the Magic logo, in the initial state', () => {
    expect(src).toContain('<PixelTotem spec={identity} size={44}')
    // The asterisk mark remains only as the in-transcript agent fallback.
    expect(src).not.toContain('<MagicMark size={16}')
  })

  it('has a fixed height so typing, matches, and streaming never resize it', () => {
    expect(shared).toContain('MAGIC_POPOVER_HEIGHT = 520')
    expect(src).toContain('MAGIC_POPOVER_HEIGHT')
    expect(src).toContain('height: `min(${MAGIC_POPOVER_HEIGHT}px, calc(100vh - 16px))`')
    expect(src).not.toContain('max-h-[min(78vh')
    // The native overlay positions the panel with the same fixed height
    // from the first frame — no grow-on-open jump either.
    expect(overlay).toContain('{ height: MAGIC_POPOVER_HEIGHT }')
    // Growth is absorbed by the scrolling transcript, not the panel.
    expect(src).toContain('min-h-0 flex-1 flex-col gap-3 overflow-y-auto')
  })

  it('keeps settings (background assistance, saved workspaces, activity, exclusions) in the gear menu, not the chat body', () => {
    expect(src).toContain('Background assistance')
    expect(src).toContain('Saved workspaces')
    expect(src).not.toContain('Recent activity')
    expect(src).not.toContain('Context saved')
  })

  it('sends a typed message through the single send path', () => {
    expect(src).toContain('const sendMessage = async (rawText: string) => {')
    expect(src).toContain('void sendMessage(query)')
    expect(src).not.toContain('fillPrompt')
  })

  it('uses restrained message styling, with no white cards or black icon tiles', () => {
    expect(src).not.toContain('ActionCard')
    expect(src).not.toContain('rounded-md bg-neutral-900')
    expect(src).not.toContain('bg-white px-4')
    expect(src).toContain('bg-white/[0.08] px-3 py-2 text-sm')
  })

  it('supports a restored conversation via initialMessages', () => {
    expect(src).toContain('initialMessages?: ChatMessage[]')
    expect(src).toContain('useState<ChatMessage[]>(() => initialMessages ?? [])')
  })

  it('has no + New button in the header', () => {
    expect(src).not.toContain('startNewConversation')
    expect(src).not.toMatch(/<Plus \/>\s*New/)
  })

  it('debounces tab matches behind a typing cooldown and animates them in with GSAP', () => {
    expect(src).toContain('const MATCH_COOLDOWN_MS = 250')
    expect(src).toContain('setTimeout(() => setCooldownQuery(query), MATCH_COOLDOWN_MS)')
    // While the cooldown hasn't elapsed for the current query, no matches.
    expect(src).toContain('if (cooldownQuery !== query) return []')
    expect(src).toContain('motion.listIn(matchesRef.current)')
    expect(src).toContain('data-animate-item')
    const motionSrc = readFileSync(new URL('../../motion.ts', import.meta.url), 'utf8')
    expect(motionSrc).toContain('listIn(el: Element)')
  })

  it('keeps the thinking state subtle, with a shimmer on the label', () => {
    expect(src).not.toContain('Magic is thinking…')
    expect(src).toContain("'Thinking…'")
    expect(src).toContain('thinking-shimmer text-sm')
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
    expect(css).toContain('@keyframes thinking-shimmer')
    expect(css).toContain('.thinking-shimmer')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('animates the user totem while thinking, like the bottom dock', () => {
    expect(src).toContain("import { PixelTotem } from '@/features/identity/PixelTotem'")
    expect(src).toContain('createIdentitySpec(context.identitySeed)')
    expect(src).toContain('<PixelTotem spec={identity} size={28} thinking={!!m.streaming}')
    // Pulsing dots remain only as the no-identity fallback.
    expect(src).toContain('{!identity && (')
    expect(src).toContain('animate-pulse rounded-full bg-white/35')
  })
})
