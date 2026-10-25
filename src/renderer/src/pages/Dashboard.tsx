import { useMemo, useState } from 'react'
import type { TaskSummary } from '@shared/ipc'
import { api, errorText, useLoader } from '../hooks'
import { useAppData } from '../app/data'
import { useNavigate } from '../app/routes'
import { subsystems } from '../app/shell/SystemStatus'
import { ActivityConsole } from '../design/ActivityConsole'
import { WaferRings } from '../design/ambient'
import { ChartCard, Histogram, PipelineTrack, ProgressGauge, StackedBar } from '../design/charts'
import { Icon } from '../design/Icon'
import { AIInsightCard, AlertPanel, type AlertItem } from '../design/intelligence'
import { EmptyState, PageLoading } from '../design/states'
import { KpiCard, Led, PageTitle, Panel, StatusBadge, TierTag } from '../design/primitives'
import { useToast } from '../design/toast'
import { STAGE_LABELS, TASK_STATUS, TIER_COLORS, TIER_ORDER, VALIDATION, clean, fmtDateTime, fmtPct, pct, tierLabel } from '../lib/domain'
import { setHandoff, useProspects, useSettings } from '../lib/queries'

export function Dashboard() {
  const { dash, events, errors } = useAppData()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('Verilumen Prospect Research')
  const [maxCompanies, setMaxCompanies] = useState(1)
  const taskId = dash?.task?.id ?? null
  const [tasks, reloadTasks] = useLoader<TaskSummary[]>(() => api.task.list(), [taskId, dash?.task?.status])
  const [prospects] = useProspects(taskId, false, dash?.task?.status)
  const [settings] = useSettings()

  const scored = useMemo(() => (prospects ?? []).filter((p) => p.relevance_score != null), [prospects])
  const tierCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prospects ?? []) m.set(p.priority, (m.get(p.priority) ?? 0) + 1)
    return m
  }, [prospects])
  const validationCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prospects ?? []) m.set(p.validation_status, (m.get(p.validation_status) ?? 0) + 1)
    return m
  }, [prospects])
  const top = useMemo(() => scored.filter((p) => p.relevant).sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)).slice(0, 6), [scored])

  if (!dash) return <PageLoading />
  const task = dash.task
  const status = task?.status
  const running = status === 'RUNNING' || status === 'HUMAN_ACTION_REQUIRED'
  const c = dash.counts
  const online = dash.browser === 'CONNECTED'

  const act = async (fn: () => Promise<unknown>, ok?: (r: unknown) => string): Promise<void> => {
    setBusy(true)
    try {
      const r = await fn()
      if (ok) toast(ok(r), 'success')
      reloadTasks()
    } catch (e) {
      toast(errorText(e), 'critical')
    } finally {
      setBusy(false)
    }
  }

  const alerts: AlertItem[] = []
  if (dash.human) alerts.push({ id: 'human', tone: 'warning', title: 'Task is waiting for you', body: dash.human.message })
  if (status === 'FAILED') alerts.push({ id: 'failed', tone: 'critical', title: 'Task failed', body: `Stopped at stage ${STAGE_LABELS[task!.stage]}.`, action: { label: 'Failure analysis', run: () => navigate('errors') } })
  if (c.companiesFailed > 0)
    alerts.push({ id: 'cfail', tone: 'warning', title: `${c.companiesFailed} compan${c.companiesFailed === 1 ? 'y' : 'ies'} failed or need a human`, body: 'These were skipped. Retry the task to reprocess them.', action: { label: 'View companies', run: () => navigate('companies') } })
  if ((errors?.length ?? 0) > 0 && status !== 'FAILED')
    alerts.push({ id: 'errs', tone: 'info', title: `${errors!.length} error${errors!.length === 1 ? '' : 's'} recorded for this task`, action: { label: 'Inspect', run: () => navigate('errors') } })
  if (dash.controllerAi === 'NOT_CONFIGURED' || dash.researchAi === 'NOT_CONFIGURED')
    alerts.push({ id: 'ai', tone: 'warning', title: 'AI services are not configured', body: 'Add OpenRouter keys and models before starting a task.', action: { label: 'Settings', run: () => navigate('settings') } })
  if (!online) alerts.push({ id: 'browser', tone: 'info', title: 'Controlled browser is offline', body: 'Start a browser profile to enable task controls.', action: { label: 'Browser sessions', run: () => navigate('profiles') } })

  const tiers = settings?.scoring.tiers
  const thresholds = tiers
    ? [
        { value: tiers.tier3, label: 'T3', color: 'var(--tier3)' },
        { value: tiers.tier2, label: 'T2', color: 'var(--tier2)' },
        { value: tiers.tier1, label: 'T1', color: 'var(--tier1)' }
      ]
    : []
  const binColor = (v: number): string => (!tiers ? 'var(--chart-1)' : v >= tiers.tier1 ? 'var(--tier1)' : v >= tiers.tier2 ? 'var(--tier2)' : v >= tiers.tier3 ? 'var(--tier3)' : 'var(--tier-low)')
  const progress = pct(c.companiesDone, c.companiesTotal)
  const emailCov = pct(c.businessEmails, c.employees)
  const ts = task ? TASK_STATUS[task.status] : null

  return (
    <div className="page">
      <section className="hero" aria-labelledby="page-title">
        <WaferRings size={360} />
        <div className="hero-content">
          <div className="row-between wrap" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="page-eyebrow label-micro">Mission Control</div>
              <PageTitle>{task ? task.name : 'No task yet'}</PageTitle>
              <div className="row wrap muted small" style={{ marginTop: 6 }}>
                {ts && (
                  <StatusBadge tone={ts.tone} dot>
                    {ts.label}
                  </StatusBadge>
                )}
                {task && (
                  <>
                    <span>
                      Stage <b style={{ color: 'var(--text)' }}>{STAGE_LABELS[task.stage]}</b>
                    </span>
                    <span>&middot; Started {fmtDateTime(task.created_at)}</span>
                    <span>&middot; Updated {fmtDateTime(task.updated_at)}</span>
                  </>
                )}
                {!task && <span>Configure a run below and press Start.</span>}
              </div>
            </div>
            {tasks && tasks.length > 1 && (
              <label className="field" style={{ minWidth: 260, maxWidth: 380 }}>
                <span className="label-micro">Task history</span>
                <select value={task?.id ?? ''} disabled={running || busy} onChange={(e) => void act(() => api.task.select(e.target.value))}>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} - {fmtDateTime(t.created_at)} ({TASK_STATUS[t.status].label})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <PipelineTrack stage={task?.stage ?? null} status={status ?? null} />
        </div>
      </section>

      <div className="health-strip" role="list" aria-label="System health">
        {subsystems(dash).map((s) => (
          <div key={s.key} className="health-cell" role="listitem">
            <span className="label-micro">{s.label}</span>
            <span className="row">
              <Led tone={s.tone} pulse={s.key === 'browser' && running} />
              {s.state}
            </span>
          </div>
        ))}
      </div>

      <AlertPanel alerts={alerts} />

      <div className="kpi-grid kpi-grid-dash" aria-label="Key metrics">
        <div className="kpi kpi-hero">
          <span className="label-micro">Companies processed</span>
          <div className="row" style={{ gap: 20, flex: 1 }}>
            <ProgressGauge value={progress} size={112} label="Companies processed" center={progress == null ? '-' : `${fmtPct(progress)}%`} sub="done" />
            <div className="stack-sm">
              <span className="num" style={{ fontSize: 'var(--fs-3xl)', lineHeight: 1 }}>
                {c.companiesDone}
                <span className="muted" style={{ fontSize: 'var(--fs-lg)' }}>
                  {' '}
                  / {c.companiesTotal}
                </span>
              </span>
              <span className="kpi-foot">{task ? STAGE_LABELS[task.stage] : 'No task'}</span>
            </div>
          </div>
        </div>
        <KpiCard label="Qualified" value={c.qualified} tone="accent" icon="target" foot={c.employees ? `${fmtPct(pct(c.qualified, c.employees))}% of employees` : 'No employees yet'} />
        <KpiCard label="Tier 1" value={c.tier1} icon="sparkle" foot="Highest priority" />
        <KpiCard label="Tier 2 / Tier 3" value={`${c.tier2} / ${c.tier3}`} icon="layers" foot="Secondary priority" />
        <KpiCard label="Employees" value={c.employees.toLocaleString()} icon="users" foot="Collected profiles" />
        <KpiCard label="Email coverage" value={emailCov == null ? '-' : fmtPct(emailCov)} unit={emailCov == null ? undefined : '%'} progress={emailCov} icon="mail" foot={`${c.businessEmails} business emails`} />
        <KpiCard label="Failed companies" value={c.companiesFailed} tone={c.companiesFailed ? 'critical' : undefined} icon="alert" foot={c.companiesFailed ? 'Retry to reprocess' : 'None'} />
      </div>

      <div className="grid-12">
        <div className="span-7">
          <ChartCard title="Relevance score distribution" question="How strongly do collected prospects match ATE / semiconductor-test buyers?" icon="scan" legend={thresholds.length ? thresholds.slice().reverse().map((t) => ({ label: `${t.label.replace('T', 'Tier ')} >= ${t.value}`, color: t.color })) : undefined}>
            {scored.length === 0 ? (
              <EmptyState compact icon="scan" title="No scored prospects yet" desc="Scores appear once the research AI evaluates employees." />
            ) : (
              <Histogram values={scored.map((p) => p.relevance_score!)} thresholds={thresholds} colorFor={binColor} countLabel="prospects" xUnit=" pts" height={200} />
            )}
          </ChartCard>
        </div>
        <div className="span-5 stack">
          <ChartCard title="Priority mix" question="Where does the prospect pool sit by tier?" icon="layers">
            {prospects && prospects.length > 0 ? (
              <StackedBar label="Priority mix" segments={TIER_ORDER.map((t) => ({ label: tierLabel(t), value: tierCounts.get(t) ?? 0, color: TIER_COLORS[t] }))} />
            ) : (
              <EmptyState compact icon="layers" title="No prospects yet" />
            )}
          </ChartCard>
          <ChartCard title="Data quality" question="Which records are export-ready?" icon="shield">
            {prospects && prospects.length > 0 ? (
              <StackedBar
                label="Validation status"
                segments={(Object.keys(VALIDATION) as (keyof typeof VALIDATION)[]).map((k) => ({
                  label: VALIDATION[k].label,
                  value: validationCounts.get(k) ?? 0,
                  color: { success: 'var(--success)', warning: 'var(--warning)', critical: 'var(--critical)' }[VALIDATION[k].tone as string] ?? 'var(--chart-6)'
                }))}
              />
            ) : (
              <EmptyState compact icon="shield" title="No records to validate" />
            )}
          </ChartCard>
        </div>
      </div>

      <Panel
        title="Top intelligence findings"
        sub="Highest-scoring qualified prospects with the research AI's reasoning"
        icon="sparkle"
        actions={
          top.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('qualified')}>
              All qualified <Icon name="chevronRight" size={12} />
            </button>
          )
        }
      >
        {top.length === 0 ? (
          <EmptyState compact icon="target" title="No qualified prospects yet" desc="Findings appear here as the research AI qualifies employees." />
        ) : (
          <div className="insight-grid">
            {top.map((p) => (
              <AIInsightCard
                key={p.employee_id}
                title={p.employee_name}
                meta={`${clean(p.employee_role) || 'Role unknown'} - ${p.company_name}`}
                confidence={{ value: p.relevance_score ?? 0, label: 'score' }}
                finding={
                  <>
                    <TierTag tier={p.priority} />
                    <StatusBadge tone={VALIDATION[p.validation_status].tone}>{VALIDATION[p.validation_status].label}</StatusBadge>
                  </>
                }
                evidence={clean(p.reason)}
                onOpen={() => {
                  setHandoff('prospect', p.employee_id)
                  navigate('qualified')
                }}
              />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid-12">
        <div className="span-5">
          <Panel title="Task control" sub={online ? 'Controlled browser online' : 'Start the browser from Browser Sessions first'} icon="terminal">
            <div className="stack">
              <div className="form-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 120px' }}>
                <label className="field">
                  <span className="field-label">Task name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} disabled={running} />
                </label>
                <label className="field">
                  <span className="field-label">Max companies</span>
                  <input type="number" min={1} value={maxCompanies} onChange={(e) => setMaxCompanies(Math.max(1, Number(e.target.value) || 1))} disabled={running} />
                </label>
              </div>
              <div className="row wrap">
                <button className="btn btn-primary" disabled={busy || running || !online} onClick={() => act(() => api.task.start({ name, maxCompanies }), () => 'Task started')}>
                  <Icon name="play" size={14} /> Start
                </button>
                <div className="btn-group" role="group" aria-label="Run controls">
                  <button className="btn" disabled={busy || status !== 'RUNNING'} onClick={() => act(() => api.task.pause(), () => 'Task paused')}>
                    <Icon name="pause" size={14} /> Pause
                  </button>
                  <button className="btn" disabled={busy || !task || status === 'COMPLETED' || status === 'RUNNING' || !online} onClick={() => act(() => api.task.resume(), () => 'Task resumed')}>
                    <Icon name="play" size={14} /> Resume
                  </button>
                  <button className="btn" disabled={busy || (!running && status !== 'PAUSED')} onClick={() => act(() => api.task.stop(), () => 'Task stopped')}>
                    <Icon name="stop" size={14} /> Stop
                  </button>
                </div>
                <button className="btn" disabled={busy || !task || running || !online} onClick={() => act(() => api.task.retry(), () => 'Retry started')}>
                  <Icon name="retry" size={14} /> Retry
                </button>
                <button className="btn" disabled={busy || !task} onClick={() => act(() => api.task.exportExcel(), (p) => `Exported to ${String(p)}`)}>
                  <Icon name="download" size={14} /> Export
                </button>
              </div>
              {dash.lastExportPath && (
                <div className="row small muted" style={{ minWidth: 0 }}>
                  <Icon name="folder" size={14} />
                  <span className="truncate mono" title={dash.lastExportPath}>
                    {dash.lastExportPath}
                  </span>
                </div>
              )}
            </div>
          </Panel>
        </div>
        <div className="span-7">
          <Panel
            title="Live activity"
            icon="pulse"
            flush
            actions={
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('activity')}>
                Full log <Icon name="chevronRight" size={12} />
              </button>
            }
          >
            <ActivityConsole events={events.slice(-300)} height={280} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
