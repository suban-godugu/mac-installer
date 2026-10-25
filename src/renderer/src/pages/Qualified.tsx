import { useEffect, useMemo, useState } from 'react'
import type { ProspectRow } from '@shared/schemas'
import { useAppData } from '../app/data'
import { ProspectInspector } from '../components/ProspectInspector'
import { Histogram } from '../design/charts'
import { Icon } from '../design/Icon'
import { AIInsightCard } from '../design/intelligence'
import { EmptyState, ErrorState, LoadingState } from '../design/states'
import { EngineeringMetric, PageHeader, Panel, StatusBadge } from '../design/primitives'
import { COMPONENT_LABELS, TIER_COLORS, VALIDATION, clean, tierLabel } from '../lib/domain'
import { takeHandoff, useProspects, useSettings } from '../lib/queries'

const TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Low Priority', 'NOT_AVAILABLE'] as const

export function Qualified() {
  const { taskId, dash } = useAppData()
  const [rows, reload, error] = useProspects(taskId, true, dash?.task?.status)
  const [settings] = useSettings()
  const [selected, setSelected] = useState<string | null>(() => takeHandoff('prospect'))
  const [q, setQ] = useState('')
  const [tierFilter, setTierFilter] = useState<string | null>(null)

  useEffect(() => {
    if (selected) document.getElementById(`prospect-${selected}`)?.scrollIntoView({ block: 'nearest' })
  }, [selected, rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) => (!tierFilter || r.priority === tierFilter) && (!s || `${r.employee_name} ${r.employee_role} ${r.company_name} ${r.reason}`.toLowerCase().includes(s))
    )
  }, [rows, q, tierFilter])
  const groups = useMemo(
    () => TIERS.map((t) => ({ tier: t, items: filtered.filter((r) => r.priority === t).sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)) })).filter((g) => g.items.length > 0),
    [filtered]
  )
  const averages = useMemo(() => {
    const withC = (rows ?? []).filter((r) => r.components)
    if (withC.length === 0) return null
    return COMPONENT_LABELS.map((c) => ({ ...c, avg: withC.reduce((a, r) => a + r.components![c.key], 0) / withC.length }))
  }, [rows])
  const sel = rows?.find((r) => r.employee_id === selected) ?? null
  const tiers = settings?.scoring.tiers

  const body = (): React.ReactNode => {
    if (error && !rows) return <ErrorState message={error} onRetry={reload} />
    if (!rows) return <LoadingState rows={8} />
    if (rows.length === 0)
      return <EmptyState wafer title={taskId ? 'No qualified profiles yet' : 'No task selected'} desc={taskId ? 'Prospects appear here once the research AI marks them relevant.' : 'Start a task from Mission Control.'} />
    if (groups.length === 0) return <EmptyState compact icon="search" title="No matches" desc="Adjust the search or tier filter." />
    return groups.map((g) => (
      <section key={g.tier} aria-labelledby={`tier-${g.tier}`} className="stack-sm">
        <h2 id={`tier-${g.tier}`} className="row label-micro" style={{ gap: 8 }}>
          <span className="legend-swatch" style={{ background: TIER_COLORS[g.tier] }} />
          {tierLabel(g.tier)}
          <span className="num faint">{g.items.length}</span>
        </h2>
        <div className="insight-grid" style={{ gridTemplateColumns: sel ? 'repeat(auto-fill, minmax(260px, 1fr))' : undefined }}>
          {g.items.map((p: ProspectRow) => (
            <div key={p.employee_id} id={`prospect-${p.employee_id}`} style={selected === p.employee_id ? { boxShadow: 'var(--glow-accent)', borderRadius: 'var(--r-md)' } : undefined}>
              <AIInsightCard
                title={p.employee_name}
                meta={`${clean(p.employee_role) || 'Role unknown'} - ${p.company_name}`}
                confidence={p.relevance_score != null ? { value: p.relevance_score, label: 'score' } : undefined}
                tone={p.validation_status === 'INVALID_EMAIL' ? 'critical' : p.validation_status === 'VALID' ? undefined : 'warning'}
                finding={
                  <>
                    <StatusBadge tone={VALIDATION[p.validation_status].tone}>{VALIDATION[p.validation_status].label}</StatusBadge>
                    {clean(p.department) && <StatusBadge tone="outline">{p.department}</StatusBadge>}
                  </>
                }
                evidence={clean(p.reason)}
                onOpen={() => setSelected((s) => (s === p.employee_id ? null : p.employee_id))}
              />
            </div>
          ))}
        </div>
      </section>
    ))
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="AI Intelligence"
        title="Qualified Intelligence"
        desc="Prospects the research AI judged relevant to ATE and semiconductor-test buying, grouped by priority. Open a finding to see the score components, reasoning and next action."
        actions={
          <button className="btn" onClick={reload}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />
      {rows && rows.length > 0 && (
        <div className="grid-12">
          <div className="span-7">
            <Panel title="Qualified score profile" sub="Score distribution of qualified prospects against tier thresholds" icon="scan">
              <Histogram
                values={rows.filter((r) => r.relevance_score != null).map((r) => r.relevance_score!)}
                thresholds={tiers ? [{ value: tiers.tier3, label: 'T3', color: 'var(--tier3)' }, { value: tiers.tier2, label: 'T2', color: 'var(--tier2)' }, { value: tiers.tier1, label: 'T1', color: 'var(--tier1)' }] : []}
                countLabel="prospects"
                xUnit=" pts"
                height={160}
              />
            </Panel>
          </div>
          <div className="span-5">
            <Panel title="Average signal strength" sub="Mean AI score component across qualified prospects" icon="sparkle">
              {averages ? (
                <div className="form-grid" style={{ gap: 12 }}>
                  {averages.map((a) => (
                    <EngineeringMetric key={a.key} label={a.label} value={(a.avg * 100).toFixed(0)} unit="%" progress={a.avg} />
                  ))}
                </div>
              ) : (
                <EmptyState compact icon="sparkle" title="No component scores stored" desc="Component scores are recorded for evaluations made by the research AI." />
              )}
            </Panel>
          </div>
        </div>
      )}
      <div className="workspace" data-open={!!sel}>
        <div className="stack">
          {rows && rows.length > 0 && (
            <div className="row wrap">
              <label className="dt-search" style={{ flex: '0 1 320px' }}>
                <Icon name="search" size={14} />
                <span className="sr-only">Search qualified prospects</span>
                <input type="search" placeholder="Search name, role, company, reasoning..." value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <div className="row wrap" role="group" aria-label="Tier filter">
                <button className="chip" aria-pressed={tierFilter === null} onClick={() => setTierFilter(null)}>
                  All <span className="num">{rows.length}</span>
                </button>
                {TIERS.filter((t) => rows.some((r) => r.priority === t)).map((t) => (
                  <button key={t} className="chip" aria-pressed={tierFilter === t} onClick={() => setTierFilter(tierFilter === t ? null : t)}>
                    <span className="legend-swatch" style={{ background: TIER_COLORS[t] }} />
                    {tierLabel(t)} <span className="num">{rows.filter((r) => r.priority === t).length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {body()}
        </div>
        {sel && <ProspectInspector p={sel} settings={settings} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
