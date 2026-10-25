import { useEffect, useState } from 'react'
import type { DashboardState } from '@shared/ipc'
import { api, errorText } from '../hooks'
import { Logo } from '../design/Logo'
import { SignalField, WaferRings } from '../design/ambient'

type StepState = 'pending' | 'active' | 'done' | 'warn'
interface Step {
  label: string
  state: StepState
  result?: string
}

const INITIAL: Step[] = [
  { label: 'INITIALIZING TEST INTELLIGENCE', state: 'active' },
  { label: 'CONNECTING DATA SERVICES', state: 'pending' },
  { label: 'CHECKING BROWSER SESSION', state: 'pending' },
  { label: 'INITIALIZING AI SERVICES', state: 'pending' },
  { label: 'READY', state: 'pending' }
]

const reduced = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, reduced() ? 0 : ms))

/**
 * Brief branded start-up. Every step reflects a real call; the whole sequence
 * is capped by minimal per-step delays (~1.2s total) and skipped under reduced motion.
 */
export function BootScreen({ onReady }: { onReady: (appName: string, dash: DashboardState) => void }) {
  const [steps, setSteps] = useState<Step[]>(INITIAL)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    const set = (i: number, state: StepState, result?: string): void => {
      if (!alive) return
      setSteps((s) => s.map((x, j) => (j === i ? { ...x, state, result } : j === i + 1 && state !== 'active' ? { ...x, state: 'active' } : x)))
    }
    void (async () => {
      try {
        setError(null)
        setSteps(INITIAL)
        const [appName] = await Promise.all([api.getAppName(), document.fonts?.ready, wait(260)])
        set(0, 'done', 'OK')
        const [dash] = await Promise.all([api.getDashboard(), wait(240)])
        set(1, 'done', 'OK')
        await wait(200)
        set(2, dash.browser === 'CONNECTED' ? 'done' : 'warn', dash.browser === 'CONNECTED' ? 'ONLINE' : 'OFFLINE')
        await wait(220)
        const ais = [dash.controllerAi, dash.researchAi]
        const ok = ais.filter((a) => a === 'CONFIGURED' || a === 'CONNECTED').length
        set(3, ok === 2 ? 'done' : 'warn', `${ok}/2 CONFIGURED`)
        await wait(180)
        set(4, 'done', '')
        if (!alive) return
        document.title = appName
        onReady(appName, dash)
        await wait(120)
        if (alive) setDone(true)
      } catch (e) {
        if (alive) setError(errorText(e))
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  const progress = steps.filter((s) => s.state === 'done' || s.state === 'warn').length / steps.length
  return (
    <div className="boot" data-done={done} role="status" aria-live="polite" aria-label="Starting Verilumen" aria-hidden={done || undefined}>
      <div className="tech-grid-layer" />
      <SignalField density={0.00006} />
      <WaferRings size={620} />
      <div className="boot-core">
        <div className="boot-logo">
          <Logo height={56} />
        </div>
        <div className="boot-tag">Semiconductor Test Intelligence</div>
        <svg className="boot-trace" viewBox="0 0 440 28" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 14H120l8-10 10 20 10-20 10 20 8-10H300l6-6 6 12 6-6H440" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <div className="boot-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <ol className="boot-steps">
          {steps.map((s) => (
            <li key={s.label} className="boot-step" data-state={s.state}>
              <span className="led" data-tone={s.state === 'done' ? 'accent' : s.state === 'warn' ? 'warning' : undefined} data-pulse={s.state === 'active' || undefined} />
              <span>{s.label}</span>
              <span className="boot-step-status">{s.result ?? (s.state === 'active' ? '...' : '')}</span>
            </li>
          ))}
        </ol>
        {error && (
          <div role="alert" style={{ textAlign: 'center', color: '#f05252', fontSize: 12 }}>
            <div style={{ marginBottom: 8 }}>Could not reach the local backend: {error}</div>
            <button className="btn btn-sm" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
