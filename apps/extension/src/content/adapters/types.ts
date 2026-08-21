/**
 * A SiteAdapter only *locates* things in the host page's DOM. It never
 * mutates the page directly — that keeps the one part of this extension
 * that is guaranteed to break on a site redesign (selectors) isolated from
 * the insertion logic, which stays stable across sites.
 *
 * Every method must return null instead of throwing when it can't find its
 * target — a missing element is an expected, recoverable state here, not
 * an error.
 */
export interface SiteAdapter {
  readonly id: string
  /** The element the launcher button should anchor its position to. */
  findAnchor(): HTMLElement | null
  /** The editable message box text gets inserted into. */
  findComposer(): HTMLElement | null
  /** The (usually hidden) file input used for image attachments. */
  findFileInput(): HTMLInputElement | null
  /**
   * Optional. Called synchronously from within the launcher button's own
   * click handler — a real, browser-trusted click on the host page — right
   * before the board overlay opens. Some sites gate file-input creation
   * behind UI that only reveals itself in response to a trusted click a
   * content script cannot synthesize on its own (see gemini.ts); this lets
   * an adapter spend that one trusted click so findFileInput() has
   * something real to find later, once the user actually sends. Must never
   * throw, and must be safe to call every time the overlay opens
   * (idempotent — the common case is "already prepared, nothing to do").
   */
  prepareForOpen?(): void
}
