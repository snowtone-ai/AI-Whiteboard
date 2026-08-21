import type { SiteAdapter } from './types'

/**
 * ChatGPT's DOM is not a public contract and changes without notice — this
 * adapter is the single highest-maintenance file in the extension. Every
 * lookup is a cascade from "specific and known" to "generic and likely to
 * still work after a redesign," so a markup change degrades the feature
 * instead of breaking it outright. Record manual verification dates in
 * docs/adapter-smoke.md whenever this file is touched or re-checked.
 */
function findComposer(): HTMLElement | null {
  const known = document.querySelector<HTMLElement>('#prompt-textarea')
  if (known) return known

  const editable = document.querySelector<HTMLElement>('form div[contenteditable="true"]')
  if (editable) return editable

  const anyEditable = document.querySelector<HTMLElement>('div[contenteditable="true"]')
  if (anyEditable) return anyEditable

  const textarea = document.querySelector<HTMLTextAreaElement>('form textarea')
  return textarea
}

/**
 * The composer text node itself is only as tall as the typed text, so
 * anchoring the launcher button to its rect makes the button drift as the
 * box grows/shrinks. The surrounding <form> is the whole input bar
 * (roughly constant height), which is what "beside the input field" means.
 */
function findComposerBar(): HTMLElement | null {
  const composer = findComposer()
  if (!composer) return null
  return composer.closest('form') ?? composer
}

function findFileInput(): HTMLInputElement | null {
  const composer = findComposer()
  const form = composer?.closest('form')
  const scoped = form?.querySelector<HTMLInputElement>('input[type="file"]')
  if (scoped) return scoped

  return document.querySelector<HTMLInputElement>('input[type="file"]')
}

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  findAnchor: findComposerBar,
  findComposer,
  findFileInput,
}
