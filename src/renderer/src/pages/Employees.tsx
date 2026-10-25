import { useMemo, useState } from 'react'
import type { ProspectRow } from '@shared/schemas'
import { useAppData } from '../app/data'
import { ProspectInspector } from '../components/ProspectInspector'
import { DataTable, type Column } from '../design/DataTable'
import { Icon } from '../design/Icon'
import { PageHeader, StatusBadge, TierTag } from '../design/primitives'
import { VALIDATION, clean } from '../lib/domain'
import { useProspects, useSettings } from '../lib/queries'

const columns: Column<ProspectRow>[] = [
  { key: 'name', label: 'Employee', render: (r) => r.employee_name, primary: true },
  { key: 'role', label: 'Role', render: (r) => clean(r.employee_role), value: (r) => clean(r.employee_role) },
  { key: 'company', label: 'Company', render: (r) => r.company_name },
  { key: 'dept', label: 'Department', render: (r) => clean(r.department), value: (r) => clean(r.department) },
  {
    key: 'email',
    label: 'Business email',
    render: (r) => (clean(r.employee_email) ? <span className="mono small">{r.employee_email}</span> : <span className="faint">-</span>),
    value: (r) => clean(r.employee_email)
  },
  { key: 'score', label: 'Score', render: (r) => (r.relevance_score == null ? <span className="faint">-</span> : r.relevance_score.toFixed(0)), value: (r) => r.relevance_score, numeric: true, width: 80 },
  { key: 'priority', label: 'Priority', render: (r) => <TierTag tier={r.priority} />, value: (r) => r.priority, width: 120 },
  { key: 'validation', label: 'Validation', render: (r) => <StatusBadge tone={VALIDATION[r.validation_status].tone}>{VALIDATION[r.validation_status].label}</StatusBadge>, value: (r) => VALIDATION[r.validation_status].label, width: 140 }
]

type VFilter = 'all' | 'issues' | 'valid'

export function Employees() {
  const { taskId, dash } = useAppData()
  const [rows, reload, error] = useProspects(taskId, false, dash?.task?.status)
  const [settings] = useSettings()
  const [selected, setSelected] = useState<string | null>(null)
  const [vf, setVf] = useState<VFilter>('all')
  const visible = useMemo(() => {
    if (!rows) return null
    if (vf === 'valid') return rows.filter((r) => r.validation_status === 'VALID')
    if (vf === 'issues') return rows.filter((r) => r.validation_status !== 'VALID' && r.validation_status !== 'NOT_QUALIFIED')
    return rows
  }, [rows, vf])
  const sel = rows?.find((r) => r.employee_id === selected) ?? null
  const issues = rows?.filter((r) => r.validation_status !== 'VALID' && r.validation_status !== 'NOT_QUALIFIED').length ?? 0

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Employees"
        desc="Every collected profile with its relevance score, priority and validation result. Select a row to inspect the evidence."
        actions={
          <button className="btn" onClick={reload}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />
      <div className="workspace" data-open={!!sel}>
        <section className="panel" aria-label="Employee table">
          <DataTable
            label="Employees"
            rows={visible}
            error={error}
            onRetry={reload}
            loading={!rows}
            columns={columns}
            rowKey={(r) => r.employee_id}
            selectedKey={selected}
            onSelect={(r) => setSelected((s) => (s === r.employee_id ? null : r.employee_id))}
            empty={taskId ? 'No employees collected yet' : 'No task selected'}
            emptyDesc={taskId ? 'Profiles appear as companies are processed.' : 'Start a task from Mission Control.'}
            searchPlaceholder="Search name, role, company, email..."
            toolbar={
              <div className="row wrap" role="group" aria-label="Validation filter">
                <button className="chip" aria-pressed={vf === 'all'} onClick={() => setVf('all')}>
                  All <span className="num">{rows?.length ?? 0}</span>
                </button>
                <button className="chip" aria-pressed={vf === 'issues'} onClick={() => setVf('issues')}>
                  {issues > 0 && <span className="led" data-tone="warning" />}
                  Data issues <span className="num">{issues}</span>
                </button>
                <button className="chip" aria-pressed={vf === 'valid'} onClick={() => setVf('valid')}>
                  Export-ready <span className="num">{rows?.filter((r) => r.validation_status === 'VALID').length ?? 0}</span>
                </button>
              </div>
            }
          />
        </section>
        {sel && <ProspectInspector p={sel} settings={settings} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
