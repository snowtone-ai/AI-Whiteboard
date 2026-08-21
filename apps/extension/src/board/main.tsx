import '@excalidraw/excalidraw/index.css'
import './styles.css'

import { createRoot } from 'react-dom/client'

import { Board } from './Board'

const root = document.getElementById('root')
if (!root) throw new Error('board.html is missing #root')

createRoot(root).render(<Board />)
