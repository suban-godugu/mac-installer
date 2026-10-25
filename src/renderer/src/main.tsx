import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/ambient.css'
import { App } from './App'
import { installBrowserApi } from './browserApi'
import { ThemeProvider, applyTheme, storedMode } from './app/theme'
import { ToastProvider } from './design/toast'

if (!window.api) installBrowserApi()
applyTheme(storedMode())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>
)
