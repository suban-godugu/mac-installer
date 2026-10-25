import { useDeferredValue, useMemo, useState } from 'react'
import type { ActivityEvent } from '@shared/ipc'
import { useAppData } from '../app/data'
import { ActivityConsole } from '../design/ActivityConsole'
import { Sparkline, bucketize } from '../design/charts'
import { Icon } from '../design/Icon'
import { PageHeader, Panel } from '../design/primitives'

const LEVELS: { id: ActivityEvent['level']; label: string; tone?: string }[] = [
  { id: 'progress', label: 'Steps' },
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Success', tone: 'success' },
  { id: 'warn', label: 'Warnings', tone: 'warning' },
  { id: 'error', label: 'Errors', tone: 'critical' }
]

export function Activity() {
  const { events, taskId } = useAppData()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim().toLowerCase())

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) m.set(e.level, (m.get(e.level) ?? 0) + 1)
    return m
  }, [events])
  const visible = useMemo(() => events.filter((e) => !hidden.has(e.level) && (!q || e.message.toLowerCase().includes(q))), [events, hidden, q])
  const rate = useMemo(() => bucketize(events.map((e) => e.ts), 30, 30 * 60_000), [events])

  const toggle = (id: string): void =>
    setHidden((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="page">
      <PageHeader eyebrow="Diagnostics" title="Activity Log" desc="High-level actions and status from the controller and research agents. Streams live while a task runs." />
      <Panel
        title={taskId ? 'Event stream' : 'Event stream (no task selected)'}
        icon="terminal"
        flush
        actions={
          <div style={{ width: 180 }} title="Events per minute, last 30 minutes">
            <Sparkline values={rate} height={24} label="Event rate over the last 30 minutes" />
          </div>
        }
      >
        <div className="dt-toolbar">
          <label className="dt-search">
            <Icon name="search" size={14} />
            <span className="sr-only">Search activity</span>
            <input type="search" placeholder="Search messages..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="row wrap" role="group" aria-label="Level filter">
            {LEVELS.map((l) => (
              <button key={l.id} className="chip" aria-pressed={!hidden.has(l.id)} onClick={() => toggle(l.id)}>
                {l.tone && <span className="led" data-tone={l.tone} />}
                {l.label} <span className="num">{counts.get(l.id) ?? 0}</span>
              </button>
            ))}
          </div>
          <span className="dt-count">
            {visible.length.toLocaleString()} / {events.length.toLocaleString()}
          </span>
        </div>
        <ActivityConsole events={visible} height="max(320px, calc(100vh - 330px))" empty={q || hidden.size ? 'No events match the filters.' : 'No activity yet.'} />
      </Panel>
    </div>
  )
}
