import { chatgptAdapter } from './adapters/chatgpt'
import { claudeAdapter } from './adapters/claude'
import { geminiAdapter } from './adapters/gemini'
import type { SiteAdapter } from './adapters/types'
import { mountLauncher } from './mount'

function selectAdapter(hostname: string): SiteAdapter | null {
  if (hostname === 'chatgpt.com' || hostname === 'chat.openai.com') return chatgptAdapter
  if (hostname === 'claude.ai') return claudeAdapter
  if (hostname === 'gemini.google.com') return geminiAdapter
  return null
}

/**
 * A content script runs on every page load of every matched URL, so an
 * uncaught error here is not just a lost feature — it can be noisy in the
 * host page's own console and, in the worst case, break page interaction.
 * Nothing past this boundary is allowed to throw uncaught.
 */
try {
  const adapter = selectAdapter(window.location.hostname)
  if (adapter) mountLauncher(adapter)
} catch (error) {
  console.error('[ai-whiteboard] failed to initialize', error)
}
