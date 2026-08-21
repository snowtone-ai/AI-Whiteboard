import type { SiteAdapter } from './types'

/**
 * gemini.google.com's DOM is not a public contract and changes without
 * notice — same maintenance posture as chatgpt.ts/claude.ts. Confirmed live
 * via chrome-devtools-mcp against an authenticated session (see
 * docs/state.md).
 *
 * Unlike ChatGPT/Claude, Gemini has no file input in the DOM at rest — it's
 * an Angular component instantiated only while the "アップロードとツール"
 * menu is open, and that menu can only be opened by a browser-trusted click
 * (confirmed live: a content-script-dispatched `.click()` on the toggle
 * button does not open it, trusted or not is the deciding factor here, not
 * bubbling/capture). A content script cannot generate a trusted click, so
 * findFileInput() intentionally returns null in the common case — the
 * insertion ladder in mount.ts then falls through to the clipboard tier
 * automatically. That path was confirmed live too: writing a PNG to the
 * clipboard and having the user press Ctrl+V into Gemini's composer attaches
 * it correctly (Gemini's editor is a Quill instance with built-in paste
 * support). A synthetic `drop` event with a populated DataTransfer was also
 * tried against the composer's dropzone and did not work — Gemini's
 * dropzone directive did not react to it even though the event carried real
 * File data, so that path was abandoned rather than shipped half-working.
 */
function findComposer(): HTMLElement | null {
  const known = document.querySelector<HTMLElement>('div[role="textbox"][contenteditable="true"]')
  if (known) return known

  const editable = document.querySelector<HTMLElement>('div[contenteditable="true"]:not(.ql-clipboard)')
  return editable
}

/**
 * The composer text node itself is only as tall as the typed text, so
 * anchoring the launcher button to its rect makes the button drift as the
 * box grows/shrinks. `[xapfileselectordropzone]` wraps the whole input bar
 * (attach button, textarea, mode selector, mic button; roughly constant
 * height), which is what "beside the input field" means here.
 */
function findComposerBar(): HTMLElement | null {
  const composer = findComposer()
  if (!composer) return null
  return composer.closest('[xapfileselectordropzone]') ?? composer
}

function findFileInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[type="file"][name="Filedata"]')
}

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  findAnchor: findComposerBar,
  findComposer,
  findFileInput,
}
