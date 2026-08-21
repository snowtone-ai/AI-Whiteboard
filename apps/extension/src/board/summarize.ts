import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

const TYPE_LABEL_JA: Record<string, string> = {
  rectangle: '四角形',
  ellipse: '楕円',
  diamond: 'ひし形',
  arrow: '矢印',
  line: '線',
  text: 'テキスト',
  freedraw: '手書き線',
  image: '画像',
  frame: 'フレーム',
}

// Beyond this many entries, or this many characters, the per-item list stops
// being a quick orientation aid and starts being chat-log clutter — a
// complex board switches to a one-line count-by-type summary instead. The
// PNG remains the actual source of detail either way; this text is only ever
// a supplement to it.
const MAX_DETAILED_ITEMS = 12
const MAX_DETAILED_CHARS = 400

/**
 * Excalidraw keeps elements in z/creation order (no separate "createdAt" field
 * exists), so array order is the cheapest reliable proxy for "the order the
 * user drew things in" — free and O(n), no network or extra computation.
 *
 * A single hand-drawn figure is almost always many separate `freedraw`
 * strokes (Excalidraw creates one element per pen-down/pen-up), so numbering
 * each stroke ("手書き線1", "手書き線2", ...) produces a long list that
 * describes nothing — the drawing itself is already fully captured in the
 * PNG. Consecutive freedraw strokes are collapsed into one entry instead.
 *
 * Text labels are drawing-order sequence numbers, not spatial pointers —
 * nothing here marks *where* "四角形1" is inside the image, it only says it
 * was the first thing drawn. Matching a label back to a specific mark in the
 * picture is left to the reader (human or AI) looking at the image itself.
 */
export function summarizeBoard(elements: readonly ExcalidrawElement[]): string {
  const visible = elements.filter((element) => !element.isDeleted)
  if (visible.length === 0) return ''

  const idToLabel = new Map<string, string>()
  const lines: string[] = []
  const typeCounts: Record<string, number> = {}
  let freedrawGroups = 0
  let freedrawStrokes = 0
  let seq = 0
  let index = 0

  while (index < visible.length) {
    const element = visible[index]

    if (element.type === 'freedraw') {
      let strokeCount = 0
      while (index < visible.length && visible[index].type === 'freedraw') {
        strokeCount++
        index++
      }
      seq++
      freedrawGroups++
      freedrawStrokes += strokeCount
      lines.push(`${seq}. 手書きの絵（${strokeCount}画）`)
      continue
    }

    seq++
    typeCounts[element.type] = (typeCounts[element.type] ?? 0) + 1
    const label = `${TYPE_LABEL_JA[element.type] ?? element.type}${seq}`
    idToLabel.set(element.id, label)

    let line = `${seq}. ${label}`

    if (element.type === 'text' && 'text' in element && element.text) {
      line += `「${element.text}」`
    }

    if (element.type === 'arrow' || element.type === 'line') {
      const startId = 'startBinding' in element ? element.startBinding?.elementId : undefined
      const endId = 'endBinding' in element ? element.endBinding?.elementId : undefined
      const from = startId ? (idToLabel.get(startId) ?? '起点') : undefined
      const to = endId ? (idToLabel.get(endId) ?? '終点') : undefined
      if (from || to) line += `（${from ?? '起点'} → ${to ?? '終点'}）`
    }

    if ('groupIds' in element && element.groupIds && element.groupIds.length > 0) {
      line += ' [グループ化]'
    }

    lines.push(line)
    index++
  }

  const detailed = lines.join('\n')
  if (lines.length <= MAX_DETAILED_ITEMS && detailed.length <= MAX_DETAILED_CHARS) {
    return detailed
  }

  const parts: string[] = []
  if (freedrawGroups > 0) parts.push(`手書きの絵${freedrawGroups}か所（計${freedrawStrokes}画）`)
  for (const [type, label] of Object.entries(TYPE_LABEL_JA)) {
    if (type === 'freedraw') continue
    const count = typeCounts[type]
    if (count) parts.push(`${label}${count}個`)
  }

  return `画像には合計${seq}個の要素があります（${parts.join('、')}）。詳細は添付画像を参照してください。`
}
