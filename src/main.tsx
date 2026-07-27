import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyBrand } from './theme/brand'
import { applyTheme, resolveInitialTheme } from './theme/theme'
import './index.css'

// Applied before the first paint so the shell never flashes the wrong palette.
applyTheme(resolveInitialTheme())
applyBrand()

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root is missing from the document')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
