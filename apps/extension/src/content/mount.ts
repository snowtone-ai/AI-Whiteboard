import type { BoardToHostMessage, HostToBoardMessage, InsertOutcome } from '../shared/messages'
import { attachImageFile } from './insert/attachFile'
import { insertTextIntoComposer } from './insert/insertText'
import { UPLOAD_INDICATOR_SELECTOR, waitForUploadSettle } from './insert/waitForUploadSettle'
import type { SiteAdapter } from './adapters/types'

const HOST_ID = 'ai-whiteboard-host'
const REPOSITION_THROTTLE_MS = 120
const RETRY_THROTTLE_MS = 800

function extensionOrigin(): string {
  return new URL(chrome.runtime.getURL('/')).origin
}

/**
 * Owns one launcher button + one overlay iframe for a single adapter. Every
 * DOM lookup is re-run each time (never cached across renders) because the
 * host page's own framework can replace these nodes at any point; caching a
 * stale reference is the classic way this kind of integration silently
 * stops working.
 */
export function mountLauncher(adapter: SiteAdapter): void {
  let hostEl: HTMLElement | null = null
  let shadow: ShadowRoot | null = null
  let button: HTMLButtonElement | null = null
  let overlay: HTMLDivElement | null = null
  let iframe: HTMLIFrameElement | null = null
  let lastReposition = 0
  let lastRetry = 0

  function ensureHost(): ShadowRoot {
    if (shadow) return shadow
    hostEl = document.createElement('div')
    hostEl.id = HOST_ID
    hostEl.style.all = 'initial'
    hostEl.style.position = 'fixed'
    hostEl.style.zIndex = '2147483000'
    document.body.appendChild(hostEl)
    shadow = hostEl.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = `
      .launcher {
        all: initial;
        position: fixed;
        width: 40px;
        height: 40px;
        border-radius: 999px;
        background: #295BFF;
        color: #F7F8F4;
        border: none;
        cursor: pointer;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(17, 24, 29, 0.35);
        font-family: system-ui, sans-serif;
      }
      .launcher:hover { filter: brightness(1.08); }
      .backdrop {
        all: initial;
        position: fixed;
        inset: 0;
        background: rgba(17, 24, 29, 0.25);
      }
      .panel {
        all: initial;
        position: fixed;
        width: 96vw;
        height: 92vh;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 12px 32px rgba(17, 24, 29, 0.4);
      }
      .panel iframe {
        all: initial;
        display: block;
        width: 100%;
        height: 100%;
        border: none;
      }
    `
    shadow.appendChild(style)
    return shadow
  }

  function ensureButton(): void {
    const root = ensureHost()
    if (button) return
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'launcher'
    button.textContent = '✎'
    button.setAttribute('aria-label', 'AIホワイトボードを開く')
    button.addEventListener('click', openOverlay)
    root.appendChild(button)
  }

  function repositionButton(): void {
    if (!button) return
    const now = Date.now()
    if (now - lastReposition < REPOSITION_THROTTLE_MS) return
    lastReposition = now

    const anchor = adapter.findAnchor()
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const buttonSize = 40
    const gap = 12
    const spaceRight = window.innerWidth - rect.right

    // Prefer sitting in the empty margin to the right of the input bar,
    // vertically centered on it. Only fall back to overlapping the bar's
    // own right edge when the viewport is too narrow to have that margin.
    const left = spaceRight >= buttonSize + gap * 2 ? rect.right + gap : Math.max(8, rect.right - buttonSize - gap)
    const top = rect.top + rect.height / 2 - buttonSize / 2

    button.style.left = `${Math.max(8, Math.min(left, window.innerWidth - buttonSize - 8))}px`
    button.style.top = `${Math.max(8, Math.min(top, window.innerHeight - buttonSize - 8))}px`
  }

  function openOverlay(): void {
    const root = ensureHost()
    if (overlay) {
      overlay.style.display = 'flex'
      return
    }

    const backdrop = document.createElement('div')
    backdrop.className = 'backdrop'
    backdrop.addEventListener('click', closeOverlay)

    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.style.left = '2vw'
    panel.style.top = '4vh'
    panel.addEventListener('click', (event) => event.stopPropagation())

    iframe = document.createElement('iframe')
    iframe.src = `${chrome.runtime.getURL('board.html')}?origin=${encodeURIComponent(window.location.origin)}`
    panel.appendChild(iframe)

    overlay = document.createElement('div')
    overlay.style.all = 'initial'
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.display = 'flex'
    overlay.appendChild(backdrop)
    overlay.appendChild(panel)
    root.appendChild(overlay)

    document.addEventListener('keydown', onEscape)
  }

  function closeOverlay(): void {
    if (overlay) overlay.style.display = 'none'
    document.removeEventListener('keydown', onEscape)
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeOverlay()
  }

  async function runInsertionLadder(png: ArrayBuffer, summary: string): Promise<InsertOutcome> {
    const composer = adapter.findComposer()
    if (composer && summary) {
      insertTextIntoComposer(composer, summary)
    }

    const fileInput = adapter.findFileInput()
    if (fileInput) {
      const file = new File([png], 'whiteboard.png', { type: 'image/png' })
      const attached = attachImageFile(fileInput, file)
      if (attached) {
        // Dispatching 'change' only starts the site's own upload of the
        // file to its backend — it does not mean the upload is finished.
        // waitForUploadSettle polls a generic, site-agnostic "does a
        // progress/spinner/busy-looking element still exist" predicate
        // scoped to the composer's form (falling back to the whole document
        // if the file input isn't inside a <form>) instead of a blind fixed
        // delay, so a genuinely slow upload gets more time and a fast one
        // doesn't force the user to wait longer than necessary.
        const scope = fileInput.closest('form') ?? document.body
        const settle = await waitForUploadSettle(() => !!scope.querySelector(UPLOAD_INDICATOR_SELECTOR))
        return settle === 'timeout' ? 'attached-unconfirmed' : 'attached'
      }
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })])
      return 'clipboard-fallback'
    } catch (error) {
      console.error('[ai-whiteboard] clipboard fallback failed', error)
      return 'failed'
    }
  }

  function onWindowMessage(event: MessageEvent<BoardToHostMessage>): void {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== extensionOrigin()) return
    const message = event.data
    if (!message) return

    if (message.type === 'ai-whiteboard:close') {
      closeOverlay()
      return
    }

    if (message.type === 'ai-whiteboard:send') {
      runInsertionLadder(message.png, message.summary)
        .then((outcome) => {
          const reply: HostToBoardMessage = { type: 'ai-whiteboard:result', outcome }
          iframe?.contentWindow?.postMessage(reply, extensionOrigin())
        })
        .catch((error) => {
          console.error('[ai-whiteboard] insertion ladder failed', error)
          const reply: HostToBoardMessage = { type: 'ai-whiteboard:result', outcome: 'failed' }
          iframe?.contentWindow?.postMessage(reply, extensionOrigin())
        })
    }
  }

  function tick(): void {
    try {
      if (!button) {
        const now = Date.now()
        if (now - lastRetry < RETRY_THROTTLE_MS) return
        lastRetry = now
        if (adapter.findAnchor()) ensureButton()
      }
      repositionButton()
    } catch (error) {
      console.error('[ai-whiteboard] mount tick failed', error)
    }
  }

  window.addEventListener('message', onWindowMessage)
  window.addEventListener('resize', tick)
  window.addEventListener('scroll', tick, true)
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true })
  tick()
}
