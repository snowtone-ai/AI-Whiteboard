import { chatgptAdapter } from './adapters/chatgpt'
import { mountLauncher } from './mount'

/**
 * A content script runs on every page load of every matched URL, so an
 * uncaught error here is not just a lost feature — it can be noisy in the
 * host page's own console and, in the worst case, break page interaction.
 * Nothing past this boundary is allowed to throw uncaught.
 */
try {
  mountLauncher(chatgptAdapter)
} catch (error) {
  console.error('[ai-whiteboard] failed to initialize', error)
}
