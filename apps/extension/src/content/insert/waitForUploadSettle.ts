/**
 * There is no cross-site, non-fragile way to know "the file actually finished
 * uploading to the host's backend" — that would require hardcoding the
 * host's own network endpoints or CSS classes, which break on any redesign.
 * This instead polls a caller-supplied predicate (typically "does a
 * progress/spinner/busy-looking element still exist inside the composer")
 * and reports what it actually observed, so the caller can give an honest
 * confidence level instead of a blind fixed delay:
 *
 * - 'settled': an indicator was seen, then it went away — the strongest
 *   signal available that the upload finished.
 * - 'timeout': an indicator appeared and never went away within maxWaitMs —
 *   a real signal something is still busy (or genuinely stuck).
 * - 'no-indicator': never observed anything — the heuristic found nothing to
 *   track either way, so this carries no information about upload state.
 */
export type UploadSettleResult = 'settled' | 'timeout' | 'no-indicator'

export interface WaitForUploadSettleOptions {
  minWaitMs?: number
  maxWaitMs?: number
  pollIntervalMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForUploadSettle(
  hasIndicator: () => boolean,
  opts: WaitForUploadSettleOptions = {},
): Promise<UploadSettleResult> {
  const minWaitMs = opts.minWaitMs ?? 600
  const maxWaitMs = opts.maxWaitMs ?? 8000
  const pollIntervalMs = opts.pollIntervalMs ?? 150

  await sleep(minWaitMs)

  const deadline = Date.now() + maxWaitMs
  let sawIndicator = false
  while (Date.now() < deadline) {
    if (hasIndicator()) {
      sawIndicator = true
    } else if (sawIndicator) {
      return 'settled'
    }
    await sleep(pollIntervalMs)
  }
  return sawIndicator ? 'timeout' : 'no-indicator'
}

/**
 * Generic, site-agnostic guess at "this looks like a busy/progress/loading
 * indicator" — deliberately broad (case-insensitive substring match) so it
 * has a chance of matching whatever class names a redesign introduces,
 * rather than a brittle exact selector tied to today's chatgpt.com markup.
 *
 * `cursor-wait` and `circle[stroke-dashoffset]` were added after live
 * verification against chatgpt.com's real attachment-tile markup (a
 * Playwright run of the actual built extension against chatgpt.com, see
 * docs/state.md): its upload-in-progress indicator is a radial SVG
 * progress ring (`<circle stroke-dashoffset="...">`) inside a wrapper with
 * a `cursor-wait` class, and matches none of "progress"/"spinner"/
 * "loading" — so every real attach on this site was silently falling
 * through to 'no-indicator' instead of ever observing the busy state.
 *
 * `pulse` was added after the same kind of live check against claude.ai:
 * its file-thumbnail image carries a Tailwind `animate-pulse` class while
 * the upload is in flight and drops it once the real file URL loads.
 * `[role="status"]` was deliberately NOT added even though claude.ai's
 * initial skeleton also uses it — claude.ai keeps several unrelated
 * `role="status"` live-region elements in the DOM at rest, so that would
 * make `hasIndicator()` return true permanently and break 'settled'
 * detection outright instead of just missing a signal.
 */
export const UPLOAD_INDICATOR_SELECTOR =
  '[role="progressbar"], [aria-busy="true"], [class*="progress" i], [class*="spinner" i], [class*="loading" i], [class*="cursor-wait" i], [class*="pulse" i], circle[stroke-dashoffset]'
