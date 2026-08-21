import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { BoardToHostMessage, HostToBoardMessage } from '../shared/messages'

/**
 * The board is embedded as a chrome-extension:// iframe inside the host page
 * (e.g. chatgpt.com). It never talks to the host page's DOM directly — all
 * communication is postMessage, explicitly targeted at the host's own origin
 * (passed in via ?origin=) and validated on receipt. This keeps the board
 * usable even if the host page is hostile or compromised: at worst it can
 * receive an unusable message, never reach into this frame's state.
 */
function readHostOrigin(): string | null {
  const raw = new URLSearchParams(window.location.search).get('origin')
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; text: string } | { kind: 'error'; text: string }

export function Board() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const hostOriginRef = useRef<string | null>(readHostOrigin())
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const postToHost = useCallback((message: BoardToHostMessage, transfer: Transferable[] = []) => {
    const hostOrigin = hostOriginRef.current
    if (!hostOrigin || !window.parent || window.parent === window) return
    window.parent.postMessage(message, hostOrigin, transfer)
  }, [])

  const handleClose = useCallback(() => {
    postToHost({ type: 'ai-whiteboard:close' })
  }, [postToHost])

  const handleSend = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    const hostOrigin = hostOriginRef.current
    if (!hostOrigin) {
      setStatus({ kind: 'error', text: '送信先ページが確認できませんでした。' })
      return
    }

    setStatus({ kind: 'sending' })
    try {
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      const files = api.getFiles()

      if (elements.length === 0) {
        setStatus({ kind: 'error', text: '何か描いてから送信してください。' })
        return
      }

      const blob = await exportToBlob({
        elements,
        files,
        mimeType: 'image/png',
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor:
            appState.viewBackgroundColor === 'transparent' ? '#ffffff' : appState.viewBackgroundColor,
        },
      })
      const png = await blob.arrayBuffer()

      postToHost({ type: 'ai-whiteboard:send', png }, [png])
    } catch (error) {
      console.error('[ai-whiteboard] export failed', error)
      setStatus({ kind: 'error', text: '書き出しに失敗しました。もう一度お試しください。' })
    }
  }, [postToHost])

  useEffect(() => {
    let autoCloseTimer: ReturnType<typeof setTimeout> | undefined

    function scheduleAutoClose(delayMs: number): void {
      clearTimeout(autoCloseTimer)
      autoCloseTimer = setTimeout(handleClose, delayMs)
    }

    function onMessage(event: MessageEvent<HostToBoardMessage>) {
      const hostOrigin = hostOriginRef.current
      if (!hostOrigin || event.origin !== hostOrigin || event.source !== window.parent) return
      const message = event.data
      if (!message || message.type !== 'ai-whiteboard:result') return

      // This panel covers nearly the whole viewport (see mount.ts), which
      // hides the host page's own composer and send button behind it. Once
      // there's nothing more for the user to do *here*, the panel closes
      // itself on a short delay (long enough to read the message) so the
      // real composer becomes reachable — this only dismisses our own
      // overlay, it never presses the host's send button (see D-013).
      if (message.outcome === 'attached') {
        setStatus({
          kind: 'done',
          text: 'アップロード完了を確認しました。画面を閉じています…実際の送信欄の送信ボタンを押してください。',
        })
        scheduleAutoClose(1200)
      } else if (message.outcome === 'attached-unconfirmed') {
        setStatus({
          kind: 'done',
          text: '送信欄に添付しましたが、アップロード完了は確認できませんでした。画面を閉じています…画像の読み込み表示が消えたことを目視で確認してから送信してください。',
        })
        scheduleAutoClose(1800)
      } else if (message.outcome === 'clipboard-fallback') {
        setStatus({ kind: 'done', text: '画像をコピーしました。画面を閉じています…入力欄で Ctrl+V を押して貼り付けてください。' })
        scheduleAutoClose(1800)
      } else {
        setStatus({ kind: 'error', text: '送信に失敗しました。入力欄をクリックしてから、もう一度お試しください。' })
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(autoCloseTimer)
    }
  }, [handleClose])

  return (
    <div className="board-shell">
      <div className="board-header">
        <span className="board-title">AIホワイトボード</span>
        <button type="button" className="icon" onClick={handleClose} aria-label="閉じる">
          ✕
        </button>
      </div>
      <div className="board-canvas">
        <Excalidraw langCode="ja-JP" excalidrawAPI={(api) => (apiRef.current = api)} />
      </div>
      <div className="board-footer">
        <span className="board-status">
          {status.kind === 'sending' && '送信中…'}
          {status.kind === 'done' && status.text}
          {status.kind === 'error' && status.text}
        </span>
        <button type="button" className="send-button" onClick={handleSend} disabled={status.kind === 'sending'}>
          送信
        </button>
      </div>
    </div>
  )
}
