import '@excalidraw/excalidraw/index.css'
import './styles.css'

import { createRoot } from 'react-dom/client'

import { Board } from './Board'

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string
  }
}

// Must be set before Excalidraw's font loader runs (triggered from Board's
// render, not at import time) so it resolves self-hosted font URLs against
// this extension's own origin. Previously lived in board.html as an inline
// <script>, which MV3's default CSP (script-src 'self', no unsafe-inline)
// silently blocked on every real page load — moved here because an external
// module script is CSP-compliant.
window.EXCALIDRAW_ASSET_PATH = chrome.runtime.getURL('/')

const root = document.getElementById('root')
if (!root) throw new Error('board.html is missing #root')

createRoot(root).render(<Board />)
