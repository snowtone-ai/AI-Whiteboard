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

/**
 * Excalidraw keeps elements in z/creation order (no separate "createdAt" field
 * exists), so array order is the cheapest reliable proxy for "the order the
 * user drew things in" — free and O(n), no network or extra computation.
 */
export function summarizeBoard(elements: readonly ExcalidrawElement[]): string {
  const visible = elements.filter((element) => !element.isDeleted)
  if (visible.length === 0) return ''

  const idToLabel = new Map<string, string>()
  const lines: string[] = []

  visible.forEach((element, index) => {
    const seq = index + 1
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
  })

  return lines.join('\n')
}
