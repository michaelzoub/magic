import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installMotion } from './motion'
import './index.css'

installMotion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
