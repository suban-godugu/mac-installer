import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ActivityEvent, DashboardState, ErrorEntry } from '@shared/ipc'
import { api, useActivity, useDashboard, useLoader } from '../hooks'

interface AppData {
  appName: string
  dash: DashboardState | null
  taskId: string | null
  events: ActivityEvent[]
  errors: ErrorEntry[] | null
  reloadErrors: () => void
}

const Ctx = createContext<AppData | null>(null)

/** Single shared subscription to dashboard state, activity stream and task errors. */
export function DataProvider({ appName, initialDash, children }: { appName: string; initialDash: DashboardState | null; children: ReactNode }) {
  const live = useDashboard()
  const dash = live ?? initialDash
  const taskId = dash?.task?.id ?? null
  const events = useActivity(taskId, 2000)
  const [errors, reloadErrors] = useLoader<ErrorEntry[]>(() => (taskId ? api.data.errors(taskId) : Promise.resolve([])), [taskId], 8000)
  const value = useMemo(() => ({ appName, dash, taskId, events, errors, reloadErrors }), [appName, dash, taskId, events, errors, reloadErrors])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppData(): AppData {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppData outside DataProvider')
  return v
}
