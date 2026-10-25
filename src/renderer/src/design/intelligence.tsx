import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import type { Tone } from './primitives'

/** Compact AI finding: what was found, how confident, why, and what to do. */
export function AIInsightCard({
  title,
  meta,
  finding,
  confidence,
  tone,
  evidence,
  onOpen
}: {
  title: ReactNode
  meta?: ReactNode
  finding?: ReactNode
  confidence?: { value: number; label: string }
  tone?: Tone
  evidence?: ReactNode
  onOpen?: () => void
}) {
  return (
    <article
      className="insight"
      data-tone={tone}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="insight-title truncate">{title}</div>
          {meta && <div className="muted small truncate">{meta}</div>}
        </div>
        {confidence && (
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 'var(--fs-xl)', lineHeight: 1, color: 'var(--accent)' }}>
              {Math.round(confidence.value)}
            </div>
            <div className="label-micro">{confidence.label}</div>
          </div>
        )}
      </div>
      {finding && <div className="row wrap">{finding}</div>}
      {evidence && (
        <div className="insight-body" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {evidence}
        </div>
      )}
    </article>
  )
}

/** Stack of labelled evidence sections inside an inspector panel. */
export function EvidencePanel({ sections }: { sections: { label: string; icon?: IconName; children: ReactNode; hidden?: boolean }[] }) {
  return (
    <div>
      {sections
        .filter((s) => !s.hidden)
        .map((s) => (
          <section key={s.label} className="evidence-section" aria-label={s.label}>
            <h3 className="label-micro row" style={{ gap: 6 }}>
              {s.icon && <Icon name={s.icon} size={12} />}
              {s.label}
            </h3>
            {s.children}
          </section>
        ))}
    </div>
  )
}

export function RecommendationPanel({ tone = 'accent', title = 'Recommended action', children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className="reco" data-tone={tone}>
      <Icon name={tone === 'critical' || tone === 'warning' ? 'alert' : tone === 'success' ? 'check' : 'zap'} size={16} />
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div className="muted">{children}</div>
      </div>
    </div>
  )
}

export interface AlertItem {
  id: string
  tone: 'critical' | 'warning' | 'success' | 'info'
  title: string
  body?: ReactNode
  action?: { label: string; run: () => void }
}

export function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="stack-sm" role="region" aria-label="Alerts">
      {alerts.map((a) => (
        <div key={a.id} className="alert" data-tone={a.tone} role={a.tone === 'critical' ? 'alert' : undefined}>
          <span className="alert-icon">
            <Icon name={a.tone === 'success' ? 'check' : a.tone === 'info' ? 'info' : 'alert'} size={16} />
          </span>
          <div className="grow">
            <div className="alert-title">{a.title}</div>
            {a.body && <div className="muted">{a.body}</div>}
          </div>
          {a.action && (
            <button className="btn btn-sm" onClick={a.action.run}>
              {a.action.label}
              <Icon name="chevronRight" size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Right-hand inspector. Becomes a bottom sheet on narrow screens. */
export function AnalysisPanel({ title, sub, onClose, children, actions }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <aside className="panel inspector" aria-label="Inspector">
      <header className="panel-head" style={{ position: 'sticky', top: 0, background: 'var(--surface-1)', zIndex: 2 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="panel-title truncate">{title}</h2>
          {sub && <div className="panel-sub truncate">{sub}</div>}
        </div>
        {actions}
        <button className="icon-btn" aria-label="Close inspector" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      {children}
    </aside>
  )
}
