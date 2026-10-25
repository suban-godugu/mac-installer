import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ActivityEvent } from '@shared/ipc'
import { fmtTime } from '../lib/domain'
import { Icon } from './Icon'

const LEVEL: Record<ActivityEvent['level'], string> = { info: 'INFO', success: 'OK', progress: 'STEP', warn: 'WARN', error: 'ERROR' }

/**
 * Monospace event console. Follows the tail until the user scrolls up;
 * lines use content-visibility so long logs only paint what is on screen.
 */
export function ActivityConsole({ events, height = 360, empty = 'No activity yet.' }: { events: ActivityEvent[]; height?: number | string; empty?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && follow) el.scrollTop = el.scrollHeight
  }, [events, follow])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const on = (): void => setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])

  return (
    <div className="console" ref={ref} style={{ height }} role="log" aria-live="off" aria-label="Activity log" tabIndex={0}>
      {events.length === 0 && <div className="console-empty">{empty}</div>}
      {events.map((e) => (
        <div key={e.id} className="console-line" data-level={e.level} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 24px' }}>
          <span className="console-time">{fmtTime(e.ts)}</span>
          <span className="console-level">{LEVEL[e.level]}</span>
          <span className="console-msg">{e.message}</span>
        </div>
      ))}
      {!follow && events.length > 0 && (
        <div className="console-resume">
          <button className="btn btn-sm" onClick={() => setFollow(true)}>
            <Icon name="arrowDown" size={12} /> Follow live
          </button>
        </div>
      )}
    </div>
  )
}
