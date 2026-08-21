/**
 * Mimics a native file picker selection: build a DataTransfer, assign it to
 * the input's .files, then dispatch a bubbling 'change' event so the host
 * page's own framework (React/ProseMirror) picks it up exactly as it would
 * a real user-driven file pick. No synthetic file-drag or paste event is
 * used here — this is the most robust of the insertion tiers because it
 * doesn't depend on isTrusted or drag/drop event support.
 */
export function attachImageFile(fileInput: HTMLInputElement, file: File): boolean {
  try {
    const transfer = new DataTransfer()
    transfer.items.add(file)
    fileInput.files = transfer.files
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch (error) {
    console.error('[ai-whiteboard] attachImageFile failed', error)
    return false
  }
}
