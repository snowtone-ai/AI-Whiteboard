/**
 * postMessage protocol between the board iframe (chrome-extension:// origin)
 * and the content script that embedded it in the host page.
 */

export interface SendPayload {
  type: 'ai-whiteboard:send'
  png: ArrayBuffer
  summary: string
}

export interface ClosePayload {
  type: 'ai-whiteboard:close'
}

export type BoardToHostMessage = SendPayload | ClosePayload

export type InsertOutcome = 'attached' | 'attached-unconfirmed' | 'clipboard-fallback' | 'failed'

export interface ResultPayload {
  type: 'ai-whiteboard:result'
  outcome: InsertOutcome
}

export type HostToBoardMessage = ResultPayload
