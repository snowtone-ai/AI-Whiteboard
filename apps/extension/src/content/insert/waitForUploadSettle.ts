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
 */
export const UPLOAD_INDICATOR_SELECTOR =
  '[role="progressbar"], [aria-busy="true"], [class*="progress" i], [class*="spinner" i], [class*="loading" i]'
