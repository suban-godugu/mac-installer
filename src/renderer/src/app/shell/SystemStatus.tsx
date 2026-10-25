import type { DashboardState } from '@shared/ipc'
import { aiInfo, authInfo } from '../../lib/domain'
import { Icon } from '../../design/Icon'
import { Led, type Tone } from '../../design/primitives'
import { usePopover } from '../../design/usePopover'

export interface Subsystem {
  key: string
  label: string
  state: string
  tone: Tone
}

export function subsystems(d: DashboardState): Subsystem[] {
  const g = authInfo(d.google)
  const z = authInfo(d.zoominfo)
  const c = aiInfo(d.controllerAi)
  const r = aiInfo(d.researchAi)
  return [
    { key: 'browser', label: 'Controlled browser', state: d.browser === 'CONNECTED' ? 'Connected' : 'Disconnected', tone: d.browser === 'CONNECTED' ? 'success' : 'neutral' },
    { key: 'google', label: 'Google', state: g.label, tone: g.tone },
    { key: 'zoominfo', label: 'ZoomInfo', state: z.label, tone: z.tone },
    { key: 'controller', label: 'Controller AI', state: c.label, tone: c.tone },
    { key: 'research', label: 'Research AI', state: r.label, tone: r.tone }
  ]
}

export function systemHealth(d: DashboardState | null): { tone: Tone; label: string } {
  if (!d) return { tone: 'neutral', label: 'Connecting' }
  if (d.human) return { tone: 'warning', label: 'Human action required' }
  if (d.task?.status === 'FAILED') return { tone: 'critical', label: 'Task failed' }
  if (d.controllerAi === 'ERROR' || d.researchAi === 'ERROR') return { tone: 'critical', label: 'AI service error' }
  if (d.browser !== 'CONNECTED') return { tone: 'neutral', label: 'Browser offline' }
  if (d.controllerAi === 'NOT_CONFIGURED' || d.researchAi === 'NOT_CONFIGURED') return { tone: 'warning', label: 'AI not configured' }
  if (d.task?.status === 'RUNNING') return { tone: 'accent', label: 'Task running' }
  return { tone: 'success', label: 'Systems ready' }
}

export function SystemStatus({ dash }: { dash: DashboardState | null }) {
  const pop = usePopover()
  const h = systemHealth(dash)
  return (
    <div className="popover-anchor" ref={pop.ref}>
      <button className="btn btn-ghost btn-sm" aria-haspopup="dialog" aria-expanded={pop.open} onClick={() => pop.setOpen((o) => !o)} aria-label={`System status: ${h.label}`}>
        <Led tone={h.tone} pulse={h.tone === 'accent' || h.tone === 'warning'} />
        <span className="sys-label">{h.label}</span>
      </button>
      {pop.open && dash && (
        <div className="popover" role="dialog" aria-label="Subsystem status" style={{ width: 280 }}>
          <div className="popover-head">
            <span className="label-micro">Subsystems</span>
            <Icon name="cpu" size={14} className="faint" />
          </div>
          <ul className="menu" style={{ listStyle: 'none', margin: 0 }}>
            {subsystems(dash).map((s) => (
              <li key={s.key} className="row-between" style={{ padding: '6px 12px', fontSize: 'var(--fs-md)' }}>
                <span className="row">
                  <Led tone={s.tone} />
                  {s.label}
                </span>
                <span className="muted small">{s.state}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
