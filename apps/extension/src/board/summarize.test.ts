import { describe, expect, it } from 'vitest'

import { summarizeBoard } from './summarize'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

function element(overrides: Partial<ExcalidrawElement> & { type: ExcalidrawElement['type']; id: string }) {
  return {
    isDeleted: false,
    groupIds: [],
    ...overrides,
  } as unknown as ExcalidrawElement
}

describe('summarizeBoard', () => {
  it('returns an empty string for an empty board', () => {
    expect(summarizeBoard([])).toBe('')
  })

  it('skips deleted elements', () => {
    const elements = [
      element({ id: 'a', type: 'rectangle' }),
      element({ id: 'b', type: 'rectangle', isDeleted: true }),
    ]
    expect(summarizeBoard(elements)).toBe('1. 四角形1')
  })

  it('includes text content for text elements', () => {
    const elements = [element({ id: 'a', type: 'text', text: 'こんにちは' } as any)]
    expect(summarizeBoard(elements)).toBe('1. テキスト1「こんにちは」')
  })

  it('describes an arrow by the shapes it connects, in drawing order', () => {
    const elements = [
      element({ id: 'a', type: 'rectangle' }),
      element({ id: 'b', type: 'ellipse' }),
      element({
        id: 'c',
        type: 'arrow',
        startBinding: { elementId: 'a' },
        endBinding: { elementId: 'b' },
      } as any),
    ]
    expect(summarizeBoard(elements)).toBe('1. 四角形1\n2. 楕円2\n3. 矢印3（四角形1 → 楕円2）')
  })

  it('marks grouped elements', () => {
    const elements = [element({ id: 'a', type: 'rectangle', groupIds: ['g1'] })]
    expect(summarizeBoard(elements)).toBe('1. 四角形1 [グループ化]')
  })
})
