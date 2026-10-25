import { useCallback, useEffect, useState } from 'react'
import type { ActivityEvent, DashboardState, RendererApi } from '@shared/ipc'

/** Reads the bridge on each call. The browser file installs it while modules are still loading. */
export const api: RendererApi = new Proxy({} as RendererApi, {
  get(_target, prop, receiver) {
    const current = window.api
    if (!current) throw new Error('Application bridge is not ready')
    const value = Reflect.get(current, prop, receiver) as unknown
    return typeof value === 'function' ? value.bind(current) : value
  }
})

export function useDashboard(): DashboardState | null {
  const [state, setState] = useState<DashboardState | null>(null)
  useEffect(() => {
    let alive = true
    void api.getDashboard().then((s) => alive && setState(s))
    const off = api.onDashboard(setState)
    const timer = setInterval(() => void api.getDashboard().then((s) => alive && setState(s)), 5000)
    return () => {
      alive = false
      off()
      clearInterval(timer)
    }
  }, [])
  return state
}

export function useActivity(taskId: string | null, limit = 200): ActivityEvent[] {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  useEffect(() => {
    let alive = true
    void api.data.activity(taskId, limit).then((e) => alive && setEvents(e))
    const off = api.onActivity((e) => {
      if (taskId && e.task_id !== taskId) return
      setEvents((prev) => [...prev.slice(-(limit - 1)), e])
    })
    return () => {
      alive = false
      off()
    }
  }, [taskId, limit])
  return events
}

/** Loads data with a manual refresh and optional polling. */
export function useLoader<T>(fn: () => Promise<T>, deps: unknown[], pollMs = 0): [T | null, () => void, string | null] {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    fn()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => setError(errorText(e)))
  }, deps)
  useEffect(() => {
    load()
    if (!pollMs) return
    const t = setInterval(load, pollMs)
    return () => clearInterval(t)
  }, [load, pollMs])
  return [data, load, error]
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
