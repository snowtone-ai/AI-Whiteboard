import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { waitForUploadSettle } from './waitForUploadSettle'

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
