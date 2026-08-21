import type { SiteAdapter } from './types'

/**
 * gemini.google.com's DOM is not a public contract and changes without
 * notice — same maintenance posture as chatgpt.ts/claude.ts. Confirmed live
 * via chrome-devtools-mcp against an authenticated session (see
 * docs/state.md).
 *
 * Unlike ChatGPT/Claude, Gemini has no file input in the DOM at rest — it's
 * an Angular component instantiated only while the "アップロードとツール"
 * menu is open, and revealing it means clicking Gemini's own "ファイルを
 * アップロード" menu item, which internally calls `.click()` on a hidden
 * `<input type="file">` to open a native OS file picker. A round 8 attempt
 * suppressed that inner click by monkey-patching
 * `HTMLInputElement.prototype.click` for the duration of one synchronous
 * call, spent from the launcher button's own trusted click — confirmed
 * working live at the time, but on real subsequent use it opened a genuine
 * native "ファイルを開く" dialog that blocked the tab (see
 * `docs/adapter-smoke.md`), meaning the inner click was not staying
 * synchronous in practice. That risk was accepted knowingly at the time but
 * has now materialized in normal use, not just a hypothetical, so the
 * interception (`prepareForOpen`, `ensureFileInputRevealed`,
 * `revealFileInput`, `clickWithoutOpeningNativeFilePicker`) was removed
 * entirely rather than hardened further — there is no reliable way to keep
 * intercepting a call whose timing this adapter doesn't control.
 * `findFileInput()` below simply never finds an input at rest, so every
 * send goes through the clipboard-fallback tier in `mount.ts`
 * (write image to clipboard + focus the composer so only the paste
 * keystroke remains) — the same tier that was already user-verified
 * end-to-end before the round 8 experiment.
 */
const UPLOAD_FILE_INPUT_SELECTOR = 'input[type="file"][name="Filedata"]'

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
  return document.querySelector<HTMLInputElement>(UPLOAD_FILE_INPUT_SELECTOR)
}

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  findAnchor: findComposerBar,
  findComposer,
  findFileInput,
}
