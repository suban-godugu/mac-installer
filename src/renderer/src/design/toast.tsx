import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastTone = 'success' | 'critical' | 'info'
interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

const Ctx = createContext<(message: string, tone?: ToastTone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++seq.current
      setItems((xs) => [...xs.slice(-3), { id, tone, message }])
      setTimeout(() => dismiss(id), tone === 'critical' ? 9000 : 5000)
    },
    [dismiss]
  )
  const value = useMemo(() => push, [push])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone} role={t.tone === 'critical' ? 'alert' : 'status'}>
            <Icon name={t.tone === 'critical' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} size={16} />
            <span className="grow">{t.message}</span>
            <button className="icon-btn" style={{ width: 22, height: 22, minHeight: 0 }} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = (): ((message: string, tone?: ToastTone) => void) => useContext(Ctx)
