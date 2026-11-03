import { createRoot } from 'react-dom/client'
import { OverlayApp } from './OverlayApp'
import '../index.css'
import './overlay.css'

createRoot(document.getElementById('root')!).render(<OverlayApp />)
