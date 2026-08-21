import type { SiteAdapter } from './types'

/**
 * claude.ai's DOM is not a public contract and changes without notice —
 * same maintenance posture as chatgpt.ts. Every lookup cascades from
 * "specific and known" to "generic and likely to still work after a
 * redesign." Record manual verification dates in docs/adapter-smoke.md
 * whenever this file is touched or re-checked.
 *
 * Unlike ChatGPT, claude.ai's composer is not inside a <form> — it's a
 * tiptap/ProseMirror contenteditable div standing alone in the layout, so
 * insertion logic that assumes a <form> ancestor (see mount.ts's
 * waitForUploadSettle scoping) falls back to document.body here. Confirmed
 * live via chrome-devtools-mcp against an authenticated session (see
 * docs/state.md).
 */
function findComposer(): HTMLElement | null {
  const known = document.querySelector<HTMLElement>('[data-testid="chat-input"]')
  if (known) return known

  const editable = document.querySelector<HTMLElement>('div[contenteditable="true"]')
  return editable
}

/**
 * The composer text node itself is only as tall as the typed text, so
 * anchoring the launcher button to its rect makes the button drift as the
 * box grows/shrinks. The <fieldset> a few levels up wraps the whole input
 * bar (roughly constant height) — attach row, textbox, and send row — which
 * is what "beside the input field" means here.
 */
function findComposerBar(): HTMLElement | null {
  const composer = findComposer()
  if (!composer) return null
  return composer.closest('fieldset') ?? composer
}

function findFileInput(): HTMLInputElement | null {
  const known = document.querySelector<HTMLInputElement>('input[data-testid="file-upload"]')
  if (known) return known

  return document.querySelector<HTMLInputElement>('input[type="file"]')
}

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  findAnchor: findComposerBar,
  findComposer,
  findFileInput,
}
