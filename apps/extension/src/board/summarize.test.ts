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

  it('collapses consecutive freedraw strokes into one entry instead of numbering each stroke', () => {
    const elements = [
      element({ id: 'a', type: 'freedraw' }),
      element({ id: 'b', type: 'freedraw' }),
      element({ id: 'c', type: 'freedraw' }),
    ]
    expect(summarizeBoard(elements)).toBe('1. 手書きの絵（3画）')
  })

  it('keeps separate freedraw groups distinct when a shape is drawn in between', () => {
    const elements = [
      element({ id: 'a', type: 'freedraw' }),
      element({ id: 'b', type: 'freedraw' }),
      element({ id: 'c', type: 'rectangle' }),
      element({ id: 'd', type: 'freedraw' }),
    ]
    expect(summarizeBoard(elements)).toBe('1. 手書きの絵（2画）\n2. 四角形2\n3. 手書きの絵（1画）')
  })

  it('switches to a compact count-by-type summary once the board has too many items to list', () => {
    const elements = Array.from({ length: 20 }, (_, i) => element({ id: `r${i}`, type: 'rectangle' }))
    const result = summarizeBoard(elements)
    expect(result).toBe('画像には合計20個の要素があります（四角形20個）。詳細は添付画像を参照してください。')
    expect(result.split('\n')).toHaveLength(1)
  })

  it('counts freedraw strokes and groups separately in the compact summary', () => {
    const elements = [
      ...Array.from({ length: 20 }, (_, i) => element({ id: `r${i}`, type: 'rectangle' })),
      element({ id: 'f1', type: 'freedraw' }),
      element({ id: 'f2', type: 'freedraw' }),
    ]
    const result = summarizeBoard(elements)
    expect(result).toBe('画像には合計21個の要素があります（手書きの絵1か所（計2画）、四角形20個）。詳細は添付画像を参照してください。')
  })
})
