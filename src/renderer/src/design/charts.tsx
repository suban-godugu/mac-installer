import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TaskStage, TaskStatus } from '@shared/schemas'
import { STAGE_LABELS, TASK_STAGES, stageIndex } from '../lib/domain'
import { Legend, Panel } from './primitives'
import type { IconName } from './Icon'

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const niceMax = (v: number): number => {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Panel framing for a visualization. `question` states what the chart answers. */
export function ChartCard({
  title,
  question,
  icon,
  actions,
  legend,
  children
}: {
  title: string
  question?: string
  icon?: IconName
  actions?: ReactNode
  legend?: { label: string; color: string; value?: ReactNode }[]
  children: ReactNode
}) {
  return (
    <Panel title={title} sub={question} icon={icon} actions={actions}>
      <div className="stack">
        {children}
        {legend && <Legend items={legend} />}
      </div>
    </Panel>
  )
}

export interface Threshold {
  value: number
  label: string
  color: string
}

/** Distribution of 0..max values in equal bins with threshold markers and crosshair inspection. */
export const Histogram = memo(function Histogram({
  values,
  bins = 10,
  max = 100,
  thresholds = [],
  height = 180,
  xUnit = '',
  countLabel = 'items',
  colorFor
}: {
  values: number[]
  bins?: number
  max?: number
  thresholds?: Threshold[]
  height?: number
  xUnit?: string
  countLabel?: string
  colorFor?: (binStart: number) => string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const counts = useMemo(() => {
    const c = new Array<number>(bins).fill(0)
    for (const v of values) c[Math.min(bins - 1, Math.max(0, Math.floor((v / max) * bins)))]++
    return c
  }, [values, bins, max])
  const m = { l: 34, r: 8, t: 18, b: 24 }
  const iw = Math.max(0, width - m.l - m.r)
  const ih = height - m.t - m.b
  const yMax = niceMax(Math.max(...counts, 1))
  const bw = iw / bins
  const x = (v: number): number => m.l + (v / max) * iw
  const y = (c: number): number => m.t + ih - (c / yMax) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * yMax))
  const step = max / bins

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          height={height}
          role="img"
          aria-label={`Histogram of ${values.length} ${countLabel}`}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const i = Math.floor((e.clientX - r.left - m.l) / bw)
            setHover(i >= 0 && i < bins ? i : null)
          }}
        >
          <g className="chart-grid">
            {ticks.map((t) => (
              <line key={t} x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g className="chart-axis">
            {ticks.map((t) => (
              <text key={t} x={m.l - 6} y={y(t) + 3} textAnchor="end">
                {t}
              </text>
            ))}
            {Array.from({ length: bins + 1 }, (_, i) => i).filter((i) => i % (bins > 10 ? 2 : 1) === 0).map((i) => (
              <text key={i} x={m.l + i * bw} y={height - 6} textAnchor="middle">
                {Math.round(i * step)}
              </text>
            ))}
            <line x1={m.l} x2={m.l + iw} y1={m.t + ih + 0.5} y2={m.t + ih + 0.5} />
          </g>
          {counts.map((c, i) => (
            <rect
              key={i}
              x={m.l + i * bw + 1.5}
              y={y(c)}
              width={Math.max(0, bw - 3)}
              height={m.t + ih - y(c)}
              rx={1}
              fill={colorFor ? colorFor(i * step) : 'var(--chart-1)'}
              opacity={hover == null || hover === i ? 0.9 : 0.4}
            />
          ))}
          {thresholds.map((t) => (
            <g key={t.label}>
              <line className="chart-threshold" x1={x(t.value)} x2={x(t.value)} y1={m.t - 6} y2={m.t + ih} stroke={t.color} />
              <text className="chart-threshold-label" x={x(t.value) + 3} y={m.t - 8} fill={t.color}>
                {t.label}
              </text>
            </g>
          ))}
          {hover != null && <line className="chart-crosshair" x1={m.l + (hover + 0.5) * bw} x2={m.l + (hover + 0.5) * bw} y1={m.t} y2={m.t + ih} />}
        </svg>
      )}
      {hover != null && (
        <div className="chart-tooltip" style={{ left: m.l + (hover + 0.5) * bw, top: y(counts[hover]) }}>
          <div className="label-micro">
            {Math.round(hover * step)}-{Math.round((hover + 1) * step)}
            {xUnit}
          </div>
          <div>
            <span className="num">{counts[hover]}</span> {countLabel}
          </div>
        </div>
      )}
    </div>
  )
})

/** Horizontal composition bar with accessible per-segment titles. */
export function StackedBar({ segments, height = 10, label }: { segments: { label: string; value: number; color: string }[]; height?: number; label: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  return (
    <div className="stack-sm">
      <div className="stacked" style={{ height }} role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        {total === 0 ? null : segments.filter((s) => s.value > 0).map((s) => <span key={s.label} title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`} style={{ flexGrow: s.value, background: s.color }} />)}
      </div>
      <Legend items={segments.map((s) => ({ label: s.label, color: s.color, value: s.value }))} />
    </div>
  )
}

/** Task stage pipeline rendered as a signal trace. */
export function PipelineTrack({ stage, status }: { stage: TaskStage | null; status: TaskStatus | null }) {
  const cur = stage ? stageIndex(stage) : -1
  const finished = status === 'COMPLETED'
  const halt = status === 'FAILED' ? 'critical' : status === 'HUMAN_ACTION_REQUIRED' || status === 'PAUSED' ? 'warning' : undefined
  return (
    <ol className="pipeline" aria-label="Task pipeline" style={{ listStyle: 'none', margin: 0 }}>
      {TASK_STAGES.map((s, i) => {
        const state = finished || i < cur ? 'done' : i === cur ? 'current' : 'todo'
        return (
          <li key={s} className="pipe-step" data-state={state} data-halt={state === 'current' ? halt : undefined} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="pipe-node" />
            <span className="pipe-label">{STAGE_LABELS[s]}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Radar for 0..1 component scores, with reference rings at 25% steps. */
export const RadarChart = memo(function RadarChart({ axes, size = 240, color = 'var(--chart-1)' }: { axes: { label: string; value: number }[]; size?: number; color?: string }) {
  const c = size / 2
  const r = c - 36
  const n = axes.length
  const pt = (i: number, v: number): [number, number] => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v]
  }
  const poly = axes.map((a, i) => pt(i, Math.max(0, Math.min(1, a.value))).join(',')).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size }} role="img" aria-label={`Score components: ${axes.map((a) => `${a.label} ${Math.round(a.value * 100)}%`).join(', ')}`}>
      <g className="chart-grid">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon key={ring} points={axes.map((_, i) => pt(i, ring).join(',')).join(' ')} fill="none" stroke="var(--grid-line)" />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 1)
          return <line key={i} x1={c} y1={c} x2={x} y2={y} />
        })}
      </g>
      <polygon points={poly} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, Math.max(0, Math.min(1, a.value)))
        return <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.2)
        return (
          <text key={a.label} className="chart-label" x={x} y={y} textAnchor={Math.abs(x - c) < 4 ? 'middle' : x > c ? 'start' : 'end'} dominantBaseline="middle">
            {a.label} <tspan fill="var(--text-2)">{Math.round(a.value * 100)}</tspan>
          </text>
        )
      })}
    </svg>
  )
})

/** Minimal trend trace. */
export const Sparkline = memo(function Sparkline({ values, height = 32, color = 'var(--chart-1)', label }: { values: number[]; height?: number; color?: string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [values.length < 2 ? 0 : (i / (values.length - 1)) * width, height - 2 - (v / max) * (height - 4)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && values.length > 0 && (
        <svg height={height} role="img" aria-label={label}>
          <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.1} />
          <path d={d} fill="none" stroke={color} strokeWidth={1.25} />
        </svg>
      )}
    </div>
  )
})

/** Bucket ISO timestamps into `n` equal windows ending now. */
export function bucketize(times: string[], n: number, windowMs: number, now = Date.now()): number[] {
  const out = new Array<number>(n).fill(0)
  const start = now - windowMs
  for (const t of times) {
    const ms = new Date(t).getTime()
    if (ms < start) continue
    out[Math.min(n - 1, Math.floor(((ms - start) / windowMs) * n))]++
  }
  return out
}

/** Circular progress gauge with wafer-style tick ring. */
export function ProgressGauge({ value, size = 120, label, center, sub, color = 'var(--accent)' }: { value: number | null; size?: number; label: string; center: ReactNode; sub?: ReactNode; color?: string }) {
  const r = size / 2 - 10
  const circ = 2 * Math.PI * r
  const v = value == null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`translate(${size / 2} ${size / 2})`}>
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1={0} y1={-(size / 2 - 1)} x2={0} y2={-(size / 2 - (i % 5 === 0 ? 5 : 3))} stroke="var(--border-strong)" transform={`rotate(${i * 6})`} />
          ))}
          <circle r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
          <circle className="gauge-ring" r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - v)} transform="rotate(-90)" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="num" style={{ fontSize: size > 100 ? 22 : 16, lineHeight: 1.1 }}>
          {center}
        </div>
        {sub && <div className="label-micro">{sub}</div>}
      </div>
    </div>
  )
}
