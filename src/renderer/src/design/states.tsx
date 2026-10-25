import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { WaferRings } from './ambient'

export function EmptyState({
  title,
  desc,
  icon,
  action,
  compact,
  wafer
}: {
  title: string
  desc?: ReactNode
  icon?: IconName
  action?: ReactNode
  compact?: boolean
  wafer?: boolean
}) {
  return (
    <div className="state" data-compact={compact || undefined} role="status">
      {wafer && !compact ? (
        <WaferRings size={96} className="state-art" style={{ position: 'static' }} />
      ) : (
        icon && (
          <span className="state-art">
            <Icon name={icon} size={compact ? 22 : 28} />
          </span>
        )
      )}
      <div className="state-title">{title}</div>
      {desc && <div className="state-desc">{desc}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Could not load data', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state" data-tone="critical" role="alert">
      <span className="state-art">
        <Icon name="alert" size={28} />
      </span>
      <div className="state-title">{title}</div>
      <div className="state-desc mono small">{message}</div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry} style={{ marginTop: 8 }}>
          <Icon name="refresh" size={14} /> Retry
        </button>
      )}
    </div>
  )
}

export function LoadingState({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="stack-sm" style={{ padding: 16 }} role="status" aria-live="polite">
      <span className="sr-only">{label}...</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 14, width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="page" aria-busy="true">
      <div className="skeleton" style={{ height: 28, width: 260 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="grid-2">
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    </div>
  )
}
