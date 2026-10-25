import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'
type Resolved = 'dark' | 'light'
const KEY = 'verilumen.theme'

const systemTheme = (): Resolved => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
export const storedMode = (): ThemeMode => {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark'
}
export const applyTheme = (mode: ThemeMode): Resolved => {
  const r = mode === 'system' ? systemTheme() : mode
  document.documentElement.dataset.theme = r
  return r
}

const Ctx = createContext<{ mode: ThemeMode; resolved: Resolved; setMode: (m: ThemeMode) => void }>({
  mode: 'dark',
  resolved: 'dark',
  setMode: () => {}
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(storedMode)
  const [resolved, setResolved] = useState<Resolved>(() => applyTheme(storedMode()))

  useEffect(() => {
    localStorage.setItem(KEY, mode)
    setResolved(applyTheme(mode))
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const on = (): void => setResolved(applyTheme('system'))
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [mode])

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTheme = (): { mode: ThemeMode; resolved: Resolved; setMode: (m: ThemeMode) => void } => useContext(Ctx)
