import { useEffect, useId, useRef, type ReactNode } from 'react'

let focusTitleOnMount = false
/** Ask the next mounted PageHeader to take focus (used after in-app navigation). */
export const requestTitleFocus = (): void => {
  focusTitleOnMount = true
}
import { Icon, type IconName } from './Icon'

export type Tone = 'success' | 'warning' | 'critical' | 'accent' | 'info' | 'neutral' | 'outline'

export function StatusBadge({ tone = 'neutral', children, dot, mono, title }: { tone?: Tone; children: ReactNode; dot?: boolean; mono?: boolean; title?: string }) {
  return (
    <span className={`badge${mono ? ' badge-mono' : ''}`} data-tone={tone} title={title}>
      {dot && <Led tone={tone} />}
      {children}
    </span>
  )
}

export function Led({ tone = 'neutral', pulse, label }: { tone?: Tone; pulse?: boolean; label?: string }) {
  return <span className="led" data-tone={tone} data-pulse={pulse || undefined} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}

export function TierTag({ tier }: { tier: string }) {
  const n = /Tier (\d)/.exec(tier)?.[1] ?? 'x'
  const label = tier === 'NOT_AVAILABLE' ? 'Unscored' : tier
  return (
    <span className="tier" data-tier={n}>
      {label}
    </span>
  )
}

export function KpiCard({
  label,
  value,
  unit,
  foot,
  tone,
  progress,
  icon
}: {
  label: string
  value: ReactNode
  unit?: string
  foot?: ReactNode
  tone?: Tone
  progress?: number | null
  icon?: IconName
}) {
  return (
    <div className="kpi" data-tone={tone}>
      <div className="kpi-head">
        <span className="label-micro">{label}</span>
        {icon && <Icon name={icon} size={14} className="faint" />}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {progress != null && (
        <div className="kpi-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      )}
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  )
}

/** A compact instrument reading: value + unit, optional bar with a threshold tick. */
export function EngineeringMetric({
  label,
  value,
  unit,
  progress,
  threshold,
  color
}: {
  label: string
  value: ReactNode
  unit?: string
  progress?: number
  threshold?: number
  color?: string
}) {
  return (
    <div className="metric">
      <span className="label-micro">{label}</span>
      <span className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </span>
      {progress != null && (
        <div className="metric-track" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: color }} />
          {threshold != null && <i style={{ left: `${threshold * 100}%` }} />}
        </div>
      )}
    </div>
  )
}

export function Panel({
  title,
  sub,
  icon,
  actions,
  children,
  flush,
  tone,
  className,
  bodyClassName
}: {
  title?: ReactNode
  sub?: ReactNode
  icon?: IconName
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  tone?: Tone
  className?: string
  bodyClassName?: string
}) {
  const id = useId()
  return (
    <section className={`panel ${className ?? ''}`} data-tone={tone} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <header className="panel-head">
          <div className="grow">
            {title && (
              <h2 className="panel-title" id={id}>
                {icon && <Icon name={icon} size={15} />}
                {title}
              </h2>
            )}
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={`panel-body${flush ? ' flush' : ''} ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  )
}

/** The page's h1; receives focus after in-app navigation for screen-reader context. */
export function PageTitle({ children }: { children: ReactNode }) {
  const h1 = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!focusTitleOnMount) return
    focusTitleOnMount = false
    h1.current?.focus({ preventScroll: true })
  }, [])
  return (
    <h1 tabIndex={-1} id="page-title" ref={h1} className="page-title">
      {children}
    </h1>
  )
}

export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="grow">
        {eyebrow && <div className="page-eyebrow label-micro">{eyebrow}</div>}
        <PageTitle>{title}</PageTitle>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="grow" style={{ minWidth: 0 }}>
      <ol className="crumbs">
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} aria-current={last ? 'page' : undefined}>
              {it.onClick && !last ? <button onClick={it.onClick}>{it.label}</button> : <span className="truncate">{it.label}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function Legend({ items }: { items: { label: string; color: string; value?: ReactNode }[] }) {
  return (
    <ul className="legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((it) => (
        <li key={it.label} className="legend-item">
          <span className="legend-swatch" style={{ background: it.color }} />
          {it.label}
          {it.value != null && <span className="num">{it.value}</span>}
        </li>
      ))}
    </ul>
  )
}

export function KeyValues({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v === '' || v == null ? <span className="faint">-</span> : v}</dd>
        </div>
      ))}
    </dl>
  )
}
