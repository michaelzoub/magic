import { createRoot } from 'react-dom/client'
import { OverlayApp } from './OverlayApp'
import { installMotion } from '../motion'
import '../index.css'
import './overlay.css'

installMotion()

createRoot(document.getElementById('root')!).render(<OverlayApp />)
