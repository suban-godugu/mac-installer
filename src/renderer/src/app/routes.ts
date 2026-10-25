import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { IconName } from '../design/Icon'

export const ROUTES = [
  { id: 'dashboard', label: 'Mission Control', group: 'Operations', icon: 'dashboard' },
  { id: 'profiles', label: 'Browser Sessions', group: 'Operations', icon: 'globe' },
  { id: 'companies', label: 'Companies', group: 'Intelligence', icon: 'building' },
  { id: 'employees', label: 'Employees', group: 'Intelligence', icon: 'users' },
  { id: 'qualified', label: 'Qualified Intelligence', group: 'Intelligence', icon: 'target' },
  { id: 'errors', label: 'Failure Analysis', group: 'Diagnostics', icon: 'alert' },
  { id: 'activity', label: 'Activity Log', group: 'Diagnostics', icon: 'pulse' },
  { id: 'settings', label: 'Settings', group: 'System', icon: 'sliders' }
] as const satisfies readonly { id: string; label: string; group: string; icon: IconName }[]

export type RouteId = (typeof ROUTES)[number]['id']
export const GROUPS = ['Operations', 'Intelligence', 'Diagnostics', 'System'] as const

const isRoute = (s: string): s is RouteId => ROUTES.some((r) => r.id === s)
const fromHash = (): RouteId => {
  const h = location.hash.replace(/^#\/?/, '')
  return isRoute(h) ? h : 'dashboard'
}

/** Page state synced with location.hash so back/forward and deep links work. */
export function useRoute(): [RouteId, (r: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(fromHash)
  useEffect(() => {
    const on = (): void => setRoute(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((r: RouteId) => {
    if (fromHash() !== r) location.hash = `/${r}`
    setRoute(r)
  }, [])
  return [route, go]
}

export const NavContext = createContext<(r: RouteId) => void>(() => {})
export const useNavigate = (): ((r: RouteId) => void) => useContext(NavContext)

export const routeInfo = (id: RouteId): (typeof ROUTES)[number] => ROUTES.find((r) => r.id === id)!
