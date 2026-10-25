import { lazy, Suspense, useCallback, useState } from 'react'
import type { DashboardState } from '@shared/ipc'
import { BootScreen } from './app/BootScreen'
import { DataProvider, useAppData } from './app/data'
import { HumanActionDialog } from './app/HumanActionDialog'
import { NavContext, useRoute, type RouteId } from './app/routes'
import { VerilumenAppShell } from './app/shell/AppShell'
import { requestTitleFocus } from './design/primitives'
import { PageLoading } from './design/states'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Profiles = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.Profiles })))
const Companies = lazy(() => import('./pages/Companies').then((m) => ({ default: m.Companies })))
const Employees = lazy(() => import('./pages/Employees').then((m) => ({ default: m.Employees })))
const Qualified = lazy(() => import('./pages/Qualified').then((m) => ({ default: m.Qualified })))
const Errors = lazy(() => import('./pages/Errors').then((m) => ({ default: m.Errors })))
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

const PAGES: Record<RouteId, React.ComponentType> = {
  dashboard: Dashboard,
  profiles: Profiles,
  companies: Companies,
  employees: Employees,
  qualified: Qualified,
  errors: Errors,
  activity: Activity,
  settings: Settings
}

export function App() {
  const [boot, setBoot] = useState<{ appName: string; dash: DashboardState } | null>(null)
  const [bootVisible, setBootVisible] = useState(true)
  const onReady = useCallback((appName: string, dash: DashboardState) => {
    setBoot({ appName, dash })
    setTimeout(() => setBootVisible(false), 700)
  }, [])
  return (
    <>
      {boot && (
        <DataProvider appName={boot.appName} initialDash={boot.dash}>
          <Workspace />
        </DataProvider>
      )}
      {bootVisible && <BootScreen onReady={onReady} />}
    </>
  )
}

function Workspace() {
  const [route, go] = useRoute()
  const { dash } = useAppData()
  const navigate = useCallback(
    (r: RouteId) => {
      requestTitleFocus()
      go(r)
    },
    [go]
  )
  const Page = PAGES[route]
  return (
    <NavContext.Provider value={navigate}>
      <VerilumenAppShell route={route} go={go}>
        <Suspense fallback={<PageLoading />}>
          <Page />
        </Suspense>
      </VerilumenAppShell>
      {dash?.human && <HumanActionDialog reason={dash.human.reason} message={dash.human.message} />}
    </NavContext.Provider>
  )
}
