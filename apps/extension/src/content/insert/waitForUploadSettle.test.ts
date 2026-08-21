// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UPLOAD_INDICATOR_SELECTOR, waitForUploadSettle } from './waitForUploadSettle'

/**
 * Captured verbatim from a live Playwright run of the real built extension
 * against chatgpt.com's actual attachment tile while an upload was in
 * flight (see docs/state.md). This is chatgpt.com's real "uploading"
 * markup — a radial SVG progress ring inside a `cursor-wait` wrapper —
 * used here as a regression fixture so UPLOAD_INDICATOR_SELECTOR can never
 * silently stop matching it again.
 */
const REAL_CHATGPT_UPLOADING_TILE_HTML = `
<div class="relative flex group/file-tile text-token-text-primary" role="group" aria-label="whiteboard.png">
  <div class="absolute inset-0 z-0 grid" data-default-action="true">
    <div class="corner-superellipse/1.1 relative max-h-full min-h-0 w-full overflow-hidden cursor-wait">
      <div data-testid="image-thumbnail-static-wrapper" class="corner-superellipse/1.1 h-full w-full overflow-clip outline-none">
        <img alt="" class="h-full w-full object-cover" draggable="false" src="blob:https://chatgpt.com/170f0a09-d0a3-4d98-9729-67c6d1fa0e7b">
      </div>
      <div class="pointer-events-none">
        <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/5 backdrop-blur-xs">
          <svg width="120" height="120" viewBox="0 0 120 120" class="h-6 w-6 text-white">
            <circle class="origin-[50%_50%] -rotate-90 stroke-gray-400" stroke-width="10" fill="transparent" r="55" cx="60" cy="60"></circle>
            <circle class="origin-[50%_50%] -rotate-90 transition-[stroke-dashoffset]" stroke="currentColor" stroke-width="10" stroke-dashoffset="342.1194399759285" stroke-dasharray="345.57519189487726 345.57519189487726" fill="transparent" r="55" cx="60" cy="60"></circle>
          </svg>
        </div>
      </div>
    </div>
  </div>
</div>
`

/**
 * Captured verbatim from a live, authenticated chrome-devtools-mcp session
 * against claude.ai's real composer while an attached file was still
 * uploading (see docs/state.md). claude.ai's "uploading" signal is a
 * Tailwind `animate-pulse` class on the thumbnail `<img>`, dropped once the
 * real `/api/.../files/.../preview` URL loads.
 */
const REAL_CLAUDE_UPLOADING_TILE_HTML = `
<div class="relative group/thumbnail" data-testid="file-thumbnail">
  <div class="rounded-lg overflow-hidden can-focus-within rounded-lg border-0.5 border-strong hover:border-stronger hover:shadow-black/10 shadow-sm shadow-black/5 cursor-pointer" style="width: 120px; height: 120px; min-width: 120px; min-height: 120px;">
    <button type="button" class="relative bg-bg-000" style="width: 120px; height: 120px;">
      <img class="w-full h-full object-contain transition duration-400 opacity-100 animate-pulse" alt="whiteboard.png" src="blob:https://claude.ai/ceb2c792-a9c2-4291-b0b4-98da34e6a1fa">
    </button>
  </div>
</div>
`

const REAL_CLAUDE_SETTLED_TILE_HTML = `
<div class="relative group/thumbnail" data-testid="file-thumbnail">
  <div class="rounded-lg overflow-hidden can-focus-within rounded-lg border-0.5 border-strong hover:border-stronger hover:shadow-black/10 shadow-sm shadow-black/5 cursor-pointer" style="width: 120px; height: 120px; min-width: 120px; min-height: 120px;">
    <button type="button" class="relative bg-bg-000" style="width: 120px; height: 120px;">
      <img class="w-full h-full object-contain transition duration-400 opacity-100" alt="whiteboard.png" src="/api/63e00ce2-7424-4f17-9595-2b0782600583/files/b952d5c8-ad54-4d83-bdb2-9381e2517d15/preview">
    </button>
  </div>
</div>
`

describe('waitForUploadSettle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "no-indicator" when the predicate never reports busy', async () => {
    const promise = waitForUploadSettle(() => false, { minWaitMs: 0, maxWaitMs: 500, pollIntervalMs: 50 })
    await vi.runAllTimersAsync()
    expect(await promise).toBe('no-indicator')
  })

  it('returns "settled" once a seen indicator disappears', async () => {
    let busy = true
    const promise = waitForUploadSettle(() => busy, { minWaitMs: 0, maxWaitMs: 2000, pollIntervalMs: 50 })
    setTimeout(() => {
      busy = false
    }, 200)
    await vi.runAllTimersAsync()
    expect(await promise).toBe('settled')
  })

  it('returns "timeout" when the indicator stays busy past maxWaitMs', async () => {
    const promise = waitForUploadSettle(() => true, { minWaitMs: 0, maxWaitMs: 300, pollIntervalMs: 50 })
    await vi.runAllTimersAsync()
    expect(await promise).toBe('timeout')
  })

  it('waits at least minWaitMs before the first check', async () => {
    let checkedAt: number | null = null
    const start = Date.now()
    const promise = waitForUploadSettle(
      () => {
        checkedAt = Date.now() - start
        return false
      },
      { minWaitMs: 1000, maxWaitMs: 1200, pollIntervalMs: 50 },
    )
    await vi.runAllTimersAsync()
    await promise
    expect(checkedAt).toBeGreaterThanOrEqual(1000)
  })
})

describe('UPLOAD_INDICATOR_SELECTOR', () => {
  it('matches chatgpt.com\'s real upload-in-progress tile markup', () => {
    document.body.innerHTML = REAL_CHATGPT_UPLOADING_TILE_HTML
    expect(document.querySelector(UPLOAD_INDICATOR_SELECTOR)).not.toBeNull()
  })

  it('stops matching once the tile settles (indicator removed)', () => {
    document.body.innerHTML = `
      <div class="relative flex group/file-tile" role="group" aria-label="whiteboard.png">
        <img alt="" class="h-full w-full object-cover" src="blob:https://chatgpt.com/settled">
      </div>
    `
    expect(document.querySelector(UPLOAD_INDICATOR_SELECTOR)).toBeNull()
  })

  it('matches claude.ai\'s real upload-in-progress thumbnail markup', () => {
    document.body.innerHTML = REAL_CLAUDE_UPLOADING_TILE_HTML
    expect(document.querySelector(UPLOAD_INDICATOR_SELECTOR)).not.toBeNull()
  })

  it('stops matching once claude.ai\'s thumbnail settles (animate-pulse dropped)', () => {
    document.body.innerHTML = REAL_CLAUDE_SETTLED_TILE_HTML
    expect(document.querySelector(UPLOAD_INDICATOR_SELECTOR)).toBeNull()
  })

  it('ignores claude.ai\'s always-present role="status" live regions', () => {
    document.body.innerHTML = `
      <div class="main">
        <div role="status" aria-live="polite"></div>
        <div role="status" aria-live="polite"></div>
      </div>
    `
    expect(document.querySelector(UPLOAD_INDICATOR_SELECTOR)).toBeNull()
  })
})
