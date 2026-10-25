import { useMemo, useState } from 'react'
import type { ErrorEntry } from '@shared/ipc'
import { useAppData } from '../app/data'
import { Sparkline } from '../design/charts'
import { DataTable, type Column } from '../design/DataTable'
import { Icon } from '../design/Icon'
import { RecommendationPanel } from '../design/intelligence'
import { EmptyState, LoadingState } from '../design/states'
import { KpiCard, PageHeader, Panel, StatusBadge } from '../design/primitives'
import { STAGE_LABELS, errorKind, fmtDateTime, relativeTime } from '../lib/domain'
import { useCompanies } from '../lib/queries'
import type { TaskStage } from '@shared/schemas'

const SEV_RANK = { critical: 0, warning: 1, info: 2 } as const
const SEV_TONE = { critical: 'critical', warning: 'warning', info: 'neutral' } as const
const stageLabel = (s: string): string => STAGE_LABELS[s as TaskStage] ?? s

interface Group {
  kind: string
  info: ReturnType<typeof errorKind>
  items: ErrorEntry[]
  stages: string[]
  companies: string[]
  latest: ErrorEntry
}

export function Errors() {
  const { taskId, dash, errors, reloadErrors } = useAppData()
  const [companies] = useCompanies(taskId, dash?.task?.status)
  const [open, setOpen] = useState<string | null>(null)
  const nameOf = useMemo(() => new Map((companies ?? []).map((c) => [c.id, c.name])), [companies])

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, ErrorEntry[]>()
    for (const e of errors ?? []) m.set(e.kind, [...(m.get(e.kind) ?? []), e])
    return [...m.entries()]
      .map(([kind, items]) => {
        const sorted = [...items].sort((a, b) => b.ts.localeCompare(a.ts))
        return {
          kind,
          info: errorKind(kind),
          items: sorted,
          stages: [...new Set(items.map((i) => i.stage))],
          companies: [...new Set(items.map((i) => i.company_id).filter((x): x is string => !!x))],
          latest: sorted[0]
        }
      })
      .sort((a, b) => SEV_RANK[a.info.severity] - SEV_RANK[b.info.severity] || b.items.length - a.items.length)
  }, [errors])

  const timeline = useMemo(() => {
    if (!errors || errors.length < 2) return null
    const ts = errors.map((e) => new Date(e.ts).getTime())
    const lo = Math.min(...ts)
    const hi = Math.max(...ts)
    const n = 40
    const out = new Array<number>(n).fill(0)
    for (const t of ts) out[Math.min(n - 1, Math.floor(((t - lo) / Math.max(1, hi - lo)) * n))]++
    return { out, lo, hi }
  }, [errors])

  const columns: Column<ErrorEntry>[] = useMemo(
    () => [
      { key: 'ts', label: 'Time', render: (e) => <span className="num small">{fmtDateTime(e.ts)}</span>, value: (e) => e.ts, width: 160 },
      { key: 'sev', label: 'Severity', render: (e) => <StatusBadge tone={SEV_TONE[errorKind(e.kind).severity]} dot>{errorKind(e.kind).severity}</StatusBadge>, value: (e) => SEV_RANK[errorKind(e.kind).severity], width: 120 },
      { key: 'kind', label: 'Type', render: (e) => errorKind(e.kind).label, value: (e) => e.kind },
      { key: 'stage', label: 'Stage', render: (e) => stageLabel(e.stage), value: (e) => e.stage },
      { key: 'company', label: 'Company', render: (e) => (e.company_id ? nameOf.get(e.company_id) ?? e.company_id : <span className="faint">Task-level</span>), value: (e) => (e.company_id ? nameOf.get(e.company_id) ?? e.company_id : '') },
      { key: 'message', label: 'Message', render: (e) => e.message, primary: false }
    ],
    [nameOf]
  )

  const critical = groups.filter((g) => g.info.severity === 'critical').reduce((a, g) => a + g.items.length, 0)
  const affected = new Set((errors ?? []).map((e) => e.company_id).filter(Boolean)).size

  return (
    <div className="page">
      <PageHeader
        eyebrow="Diagnostics"
        title="Failure Analysis"
        desc="Errors for the current task grouped by failure type and ordered by severity, with affected companies, evidence and a recommended action."
        actions={
          <button className="btn" onClick={reloadErrors}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />
      {!errors ? (
        <Panel>
          <LoadingState />
        </Panel>
      ) : errors.length === 0 ? (
        <Panel>
          <EmptyState wafer title={taskId ? 'No failures recorded' : 'No task selected'} desc={taskId ? 'The current task has no recorded errors.' : 'Start a task from Mission Control.'} />
        </Panel>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total errors" value={errors.length} icon="alert" foot={`Last ${relativeTime(groups.map((g) => g.latest.ts).sort().pop()!)}`} />
            <KpiCard label="Critical" value={critical} tone={critical ? 'critical' : undefined} foot="Task-halting failures" />
            <KpiCard label="Failure types" value={groups.length} icon="layers" />
            <KpiCard label="Affected companies" value={affected} icon="building" foot={companies ? `of ${companies.length} collected` : undefined} />
            <div className="kpi">
              <span className="label-micro">Occurrence timeline</span>
              {timeline ? <Sparkline values={timeline.out} height={44} color="var(--warning)" label="Error occurrences over the task" /> : <span className="muted small">Single occurrence</span>}
              {timeline && (
                <div className="row-between kpi-foot num">
                  <span>{fmtDateTime(new Date(timeline.lo).toISOString())}</span>
                  <span>{fmtDateTime(new Date(timeline.hi).toISOString())}</span>
                </div>
              )}
            </div>
          </div>

          <div className="stack-sm" role="list" aria-label="Failure groups">
            {groups.map((g) => {
              const isOpen = open === g.kind
              return (
                <section key={g.kind} className="panel" data-tone={g.info.severity === 'critical' ? 'critical' : undefined} role="listitem">
                  <button
                    className="panel-head"
                    style={{ width: '100%', background: 'none', border: 0, borderBottom: isOpen ? '1px solid var(--border)' : 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : g.kind)}
                  >
                    <span className="row grow wrap" style={{ gap: 12 }}>
                      <StatusBadge tone={SEV_TONE[g.info.severity]} dot>
                        {g.info.severity}
                      </StatusBadge>
                      <span style={{ fontWeight: 600 }}>{g.info.label}</span>
                      <span className="badge badge-mono" data-tone="outline">
                        {g.kind}
                      </span>
                      <span className="muted small">
                        {g.stages.map(stageLabel).join(', ')}
                        {g.companies.length > 0 && ` - ${g.companies.length} compan${g.companies.length === 1 ? 'y' : 'ies'}`}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: 'var(--fs-xl)' }}>
                      {g.items.length}
                    </span>
                    <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} className="faint" />
                  </button>
                  {isOpen && (
                    <div className="grid-2" style={{ padding: 16, alignItems: 'start' }}>
                      <div className="stack-sm">
                        <span className="label-micro">Latest evidence - {fmtDateTime(g.latest.ts)}</span>
                        <p className="reasoning mono small">{g.latest.message}</p>
                        <RecommendationPanel tone={g.info.severity === 'critical' ? 'critical' : 'warning'}>{g.info.action}</RecommendationPanel>
                      </div>
                      <div className="stack-sm">
                        <span className="label-micro">Affected companies</span>
                        {g.companies.length === 0 ? (
                          <span className="muted small">Task-level failure, not tied to a company.</span>
                        ) : (
                          <ul className="small" style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: 'auto' }}>
                            {g.companies.map((id) => (
                              <li key={id}>
                                {nameOf.get(id) ?? id} <span className="faint num">({g.items.filter((i) => i.company_id === id).length})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <section className="panel" aria-label="All occurrences">
            <header className="panel-head">
              <h2 className="panel-title">
                <Icon name="terminal" size={15} />
                All occurrences
              </h2>
            </header>
            <DataTable
              label="Error occurrences"
              rows={errors}
              columns={columns}
              rowKey={(e) => String(e.id)}
              defaultSort={{ key: 'ts', dir: 'descending' }}
              renderDetail={(e) => <p className="reasoning mono small">{e.message}</p>}
              empty="No errors"
              searchPlaceholder="Search messages, stages, companies..."
            />
          </section>
        </>
      )}
    </div>
  )
}