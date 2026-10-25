import { useMemo, useState } from 'react'
import type { ActivityEvent, DashboardState } from '@shared/ipc'
import { HUMAN_REASONS, fmtTime } from '../../lib/domain'
import { Icon } from '../../design/Icon'
import { Led } from '../../design/primitives'
import { usePopover } from '../../design/usePopover'

/** Attention feed derived from real warn/error activity and the human-action gate. */
export function NotificationCenter({ dash, events, onOpenLog }: { dash: DashboardState | null; events: ActivityEvent[]; onOpenLog: () => void }) {
  const pop = usePopover()
  const [seen, setSeen] = useState(0)
  const items = useMemo(() => events.filter((e) => e.level === 'warn' || e.level === 'error').slice(-30).reverse(), [events])
  const unread = items.filter((e) => e.id > seen).length + (dash?.human ? 1 : 0)
  const hasError = items.some((e) => e.id > seen && e.level === 'error')

  return (
    <div className="popover-anchor" ref={pop.ref}>
      <button
        className="icon-btn"
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        title="Notifications"
        onClick={() => {
          pop.setOpen((o) => !o)
          if (items[0]) setSeen(items[0].id)
        }}
      >
        <Icon name="bell" />
        {unread > 0 && <span className="dot" data-tone={hasError ? 'critical' : undefined} />}
      </button>
      {pop.open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="popover-head">
            <span className="label-micro">Attention</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                pop.setOpen(false)
                onOpenLog()
              }}
            >
              Open log
            </button>
          </div>
          <ul className="notif-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {dash?.human && (
              <li className="notif">
                <Led tone="warning" pulse />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{HUMAN_REASONS[dash.human.reason]?.label ?? dash.human.reason}</div>
                  <div className="muted">{dash.human.message}</div>
                </div>
              </li>
            )}
            {items.map((e) => (
              <li key={e.id} className="notif">
                <Led tone={e.level === 'error' ? 'critical' : 'warning'} />
                <div className="grow">
                  <div>{e.message}</div>
                  <div className="faint num small">{fmtTime(e.ts)}</div>
                </div>
              </li>
            ))}
            {!dash?.human && items.length === 0 && (
              <li className="notif muted" style={{ justifyContent: 'center', padding: 24 }}>
                No warnings or errors for the current task.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
