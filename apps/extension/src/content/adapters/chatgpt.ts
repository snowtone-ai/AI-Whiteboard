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

function findFileInput(): HTMLInputElement | null {
  const composer = findComposer()
  const form = composer?.closest('form')
  const scoped = form?.querySelector<HTMLInputElement>('input[type="file"]')
  if (scoped) return scoped

  return document.querySelector<HTMLInputElement>('input[type="file"]')
}

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  findAnchor: findComposer,
  findComposer,
  findFileInput,
}
