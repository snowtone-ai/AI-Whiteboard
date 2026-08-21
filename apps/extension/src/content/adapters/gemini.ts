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
 * button does not open it, and neither does a synthetic `drop` event on the
 * composer's dropzone with a real, populated DataTransfer — both tried and
 * confirmed not to work). A content script cannot generate a trusted click
 * on its own, but mount.ts calls `prepareForOpen` below synchronously from
 * inside the launcher button's own click handler — a real, trusted click on
 * this page — and that's enough: confirmed live that a synchronous
 * `.click()` on the toggle from inside that handler does open the menu.
 *
 * That one trusted click is also enough for the whole drawing session, not
 * just the instant it fires. Confirmed live (surprising at first): clicks
 * inside the board's iframe never generate any corresponding event at all
 * on this top-level page — not click, mousedown, or focus — because the
 * iframe is cross-origin (chrome-extension:// vs https://gemini.google.com).
 * So none of the user's drawing ever reaches Gemini's own document-level
 * "outside click closes the menu" listener, and the menu opened here
 * survives untouched until the user actually sends. (A separate design that
 * tried to re-open the menu on every board click was scrapped once this
 * became clear — there was never anything to re-open it *against*.)
 *
 * Revealing the input requires clicking Gemini's own "ファイルをアップロード"
 * menu item, which internally calls `.click()` on its own hidden
 * `<input type="file">` to open a native OS file picker — that native click
 * is suppressed for the duration of this one synchronous call (see
 * `revealFileInput`). Only *opening the menu* needs to happen inside the
 * trusted click — clicking the menu item afterward does not (confirmed
 * live: doing so from a wholly separate, later call still works, because
 * intercepting `HTMLInputElement.prototype.click` replaces the native
 * picker-opening call before the browser ever evaluates whether it's
 * trusted). That matters because the menu item itself renders on a delay
 * after the toggle click (confirmed live — it is not yet in the DOM at the
 * instant `toggle.click()` returns), so `ensureFileInputRevealed` opens the
 * menu synchronously but polls briefly for the item afterward rather than
 * looking for it immediately.
 *
 * This is safe only as long as Gemini's own handler makes that inner
 * `.click()` call synchronously (confirmed live); if a future Gemini
 * redesign makes it asynchronous, the interception window would miss it and
 * a real native file picker could open — findFileInput() returning null
 * either way (menu never having been opened, polling timed out, or Gemini
 * redesigned) still degrades cleanly to the clipboard-fallback tier, which
 * is what shipped and was user-verified before this file existed.
 */
const UPLOAD_TOGGLE_SELECTOR = 'button[aria-label="アップロードとツール"]'
const UPLOAD_FILE_INPUT_SELECTOR = 'input[type="file"][name="Filedata"]'
// Locale-independent: keyed off the custom element Angular renders for this
// specific menu item, not its (Japanese) visible label text. The uploader
// also renders a same-named `.hidden-local-file-image-selector-button` that
// looks tempting but does not trigger the same input (confirmed live).
const UPLOAD_FILE_MENU_ITEM_SELECTOR = 'images-files-uploader button:not([class*="hidden"])'
const MENU_ITEM_POLL_INTERVAL_MS = 50
const MENU_ITEM_POLL_TIMEOUT_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clickWithoutOpeningNativeFilePicker(input: HTMLElement): void {
  const originalClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {}
  try {
    input.click()
  } finally {
    HTMLInputElement.prototype.click = originalClick
  }
}

async function revealFileInput(): Promise<void> {
  const deadline = Date.now() + MENU_ITEM_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (document.querySelector(UPLOAD_FILE_INPUT_SELECTOR)) return
    const menuItem = document.querySelector<HTMLButtonElement>(UPLOAD_FILE_MENU_ITEM_SELECTOR)
    if (menuItem) {
      clickWithoutOpeningNativeFilePicker(menuItem)
      return
    }
    await sleep(MENU_ITEM_POLL_INTERVAL_MS)
  }
}

function ensureFileInputRevealed(): void {
  if (document.querySelector(UPLOAD_FILE_INPUT_SELECTOR)) return

  const toggle = document.querySelector<HTMLButtonElement>(UPLOAD_TOGGLE_SELECTOR)
  if (!toggle) return
  if (!document.querySelector('[role="menu"]')) toggle.click()

  void revealFileInput()
}

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
  prepareForOpen: ensureFileInputRevealed,
}
