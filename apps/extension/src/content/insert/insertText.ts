/**
 * Inserting text into a framework-owned contenteditable (ProseMirror, in
 * ChatGPT's case) needs to go through the browser's own editing commands —
 * setting textContent or using the Range API directly leaves the
 * framework's internal document model out of sync with what's on screen.
 * execCommand('insertText') is deprecated but is still the one API that
 * produces a real, framework-visible edit; a manual Range+dispatch fallback
 * covers the rare case where it's unsupported (execCommand returns false).
 */
export function insertTextIntoComposer(composer: HTMLElement, text: string): boolean {
  try {
    composer.focus()

    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(composer)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    const handled = document.execCommand('insertText', false, text)
    if (handled) return true

    const range = document.createRange()
    range.selectNodeContents(composer)
    range.collapse(false)
    range.insertNode(document.createTextNode(text))
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    return true
  } catch (error) {
    console.error('[ai-whiteboard] insertTextIntoComposer failed', error)
    return false
  }
}
