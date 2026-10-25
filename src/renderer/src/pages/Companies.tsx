import { useMemo, useState } from 'react'
import type { CompanyRecord, CompanyStatus } from '@shared/schemas'
import { useAppData } from '../app/data'
import { StackedBar } from '../design/charts'
import { DataTable, type Column } from '../design/DataTable'
import { Icon } from '../design/Icon'
import { RecommendationPanel } from '../design/intelligence'
import { KeyValues, PageHeader, Panel, StatusBadge } from '../design/primitives'
import { COMPANY_STATUS, COMPANY_STATUSES, clean } from '../lib/domain'
import { ExternalLink, httpsUrl } from '../lib/links'
import { useCompanies } from '../lib/queries'

type Filter = 'all' | 'attention' | 'active' | 'done' | 'pending'
const FILTERS: { id: Filter; label: string; match: (s: CompanyStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'attention', label: 'Needs attention', match: (s) => s === 'FAILED' || s === 'NEEDS_HUMAN' },
  { id: 'active', label: 'In progress', match: (s) => s === 'PROCESSING' || s === 'EMPLOYEES_FOUND' || s === 'QUALIFIED' },
  { id: 'done', label: 'Completed', match: (s) => s === 'COMPLETED' },
  { id: 'pending', label: 'Pending', match: (s) => s === 'PENDING' }
]

const columns: Column<CompanyRecord>[] = [
  { key: 'idx', label: '#', render: (c) => c.idx + 1, value: (c) => c.idx, width: 56, numeric: true },
  { key: 'name', label: 'Company', render: (c) => c.name, primary: true },
  { key: 'status', label: 'Status', render: (c) => <StatusBadge tone={COMPANY_STATUS[c.status].tone} dot>{COMPANY_STATUS[c.status].label}</StatusBadge>, value: (c) => COMPANY_STATUS[c.status].label, width: 150 },
  { key: 'industry', label: 'Industry', render: (c) => clean(c.industry), value: (c) => clean(c.industry) },
  { key: 'naics', label: 'NAICS', render: (c) => <span className="num">{clean(c.naics)}</span>, value: (c) => clean(c.naics), width: 90 },
  { key: 'location', label: 'Location', render: (c) => clean(c.location), value: (c) => clean(c.location) },
  { key: 'employees', label: 'Headcount', render: (c) => <span className="num">{clean(c.employee_count)}</span>, value: (c) => clean(c.employee_count), width: 110 },
  { key: 'attempts', label: 'Attempts', render: (c) => <span className={c.attempts > 1 ? 'num tone-warning' : 'num'}>{c.attempts}</span>, value: (c) => c.attempts, numeric: true, width: 90 },
  { key: 'error', label: 'Last error', render: (c) => (c.error ? <span className="tone-critical">{c.error}</span> : ''), value: (c) => c.error }
]

function CompanyDetail({ c }: { c: CompanyRecord }) {
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <KeyValues
        items={[
          ['Website', <ExternalLink key="w" href={httpsUrl(c.website)}>{clean(c.website)}</ExternalLink>],
          ['Domain', clean(c.domain)],
          ['ZoomInfo', <ExternalLink key="z" href={httpsUrl(c.profile_url)}>{clean(c.zoominfo_id) || 'Profile'}</ExternalLink>],
          ['Technology', clean(c.technology)],
          ['Source', clean(c.source)]
        ]}
      />
      <div className="stack-sm">
        {clean(c.description) && <p className="reasoning">{c.description}</p>}
        {c.error && (
          <RecommendationPanel tone={c.status === 'NEEDS_HUMAN' ? 'warning' : 'critical'} title={COMPANY_STATUS[c.status].label}>
            {c.error}. Retry the task from Mission Control to reprocess this company.
          </RecommendationPanel>
        )}
      </div>
    </div>
  )
}

export function Companies() {
  const { taskId, dash } = useAppData()
  const [rows, reload, error] = useCompanies(taskId, dash?.task?.status)
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => {
    const m = new Map<CompanyStatus, number>()
    for (const r of rows ?? []) m.set(r.status, (m.get(r.status) ?? 0) + 1)
    return m
  }, [rows])
  const f = FILTERS.find((x) => x.id === filter)!
  const visible = useMemo(() => (rows ? rows.filter((r) => f.match(r.status)) : null), [rows, f])

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Companies"
        desc="Target accounts collected from ZoomInfo search and their processing state through the research pipeline."
        actions={
          <button className="btn" onClick={reload}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />
      {rows && rows.length > 0 && (
        <Panel title="Processing state" sub="Where each account is in the pipeline" icon="layers">
          <StackedBar label="Company status" height={12} segments={COMPANY_STATUSES.map((s) => ({ label: COMPANY_STATUS[s].label, value: counts.get(s) ?? 0, color: COMPANY_STATUS[s].color }))} />
        </Panel>
      )}
      <section className="panel" aria-label="Company table">
        <DataTable
          label="Companies"
          rows={visible}
          error={error}
          onRetry={reload}
          loading={!rows}
          columns={columns}
          rowKey={(c) => c.id}
          renderDetail={(c) => <CompanyDetail c={c} />}
          empty={taskId ? 'No companies collected yet' : 'No task selected'}
          emptyDesc={taskId ? 'Companies appear as the controller collects search results.' : 'Start a task from Mission Control.'}
          searchPlaceholder="Search company, industry, NAICS..."
          toolbar={
            <div className="row wrap" role="group" aria-label="Status filter">
              {FILTERS.map((x) => {
                const n = (rows ?? []).filter((r) => x.match(r.status)).length
                return (
                  <button key={x.id} className="chip" aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
                    {x.id === 'attention' && n > 0 && <span className="led" data-tone="critical" />}
                    {x.label} <span className="num">{n}</span>
                  </button>
                )
              })}
            </div>
          }
        />
      </section>
    </div>
  )
}
