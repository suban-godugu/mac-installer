import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, errorText } from '../../hooks'
import { useAppData } from '../data'
import { GROUPS, ROUTES, routeInfo, type RouteId } from '../routes'
import { useTheme } from '../theme'
import { Icon } from '../../design/Icon'
import { Logo } from '../../design/Logo'
import { Breadcrumbs, Led, requestTitleFocus } from '../../design/primitives'
import { useToast } from '../../design/toast'
import { TASK_STATUS } from '../../lib/domain'
import { CommandPalette, type Command } from './CommandPalette'
import { NotificationCenter } from './NotificationCenter'
import { SystemStatus } from './SystemStatus'
import { ThemeSwitcher } from './ThemeSwitcher'

const SIDEBAR_KEY = 'verilumen.sidebarCollapsed'
const GROUPS_KEY = 'verilumen.navGroupsClosed'

export function VerilumenAppShell({ route, go, children }: { route: RouteId; go: (r: RouteId) => void; children: ReactNode }) {
  const { dash, events, errors } = useAppData()
  const { setMode } = useTheme()
  const toast = useToast()
  const [collapsed, setCollapsed] = useState(() => {
    const v = localStorage.getItem(SIDEBAR_KEY)
    return v == null ? window.innerWidth < 1280 : v === '1'
  })
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'), [collapsed])

  const navigate = useCallback(
    (r: RouteId) => {
      requestTitleFocus()
      go(r)
      setDrawer(false)
    },
    [go]
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [route])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      } else if (e.altKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault()
        navigate(ROUTES[Number(e.key) - 1].id)
      } else if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const status = dash?.task?.status
  const running = status === 'RUNNING' || status === 'HUMAN_ACTION_REQUIRED'
  const commands = useMemo<Command[]>(() => {
    const act = (label: string, fn: () => Promise<unknown>, ok: (r: unknown) => string) => (): void =>
      void fn()
        .then((r) => toast(ok(r), 'success'))
        .catch((e) => toast(`${label}: ${errorText(e)}`, 'critical'))
    const list: Command[] = ROUTES.map((r, i) => ({ id: `go-${r.id}`, group: 'Navigate', label: r.label, icon: r.icon, hint: `Alt+${i + 1}`, keywords: r.group, run: () => navigate(r.id) }))
    if (status === 'RUNNING') list.push({ id: 'pause', group: 'Task', label: 'Pause task', icon: 'pause', run: act('Pause', () => api.task.pause(), () => 'Task paused') })
    if (dash?.task && status !== 'COMPLETED' && status !== 'RUNNING' && dash.browser === 'CONNECTED')
      list.push({ id: 'resume', group: 'Task', label: 'Resume task', icon: 'play', run: act('Resume', () => api.task.resume(), () => 'Task resumed') })
    if (running || status === 'PAUSED') list.push({ id: 'stop', group: 'Task', label: 'Stop task', icon: 'stop', run: act('Stop', () => api.task.stop(), () => 'Task stopped') })
    if (dash?.task) list.push({ id: 'export', group: 'Task', label: 'Export to Excel', icon: 'download', run: act('Export', () => api.task.exportExcel(), (p) => `Exported to ${String(p)}`) })
    if (dash?.browser === 'CONNECTED') list.push({ id: 'auth', group: 'Browser', label: 'Check authentication', icon: 'shield', run: act('Check auth', () => api.browser.checkAuth(), () => 'Authentication status refreshed') })
    list.push(
      { id: 'theme-dark', group: 'Appearance', label: 'Dark theme', icon: 'moon', run: () => setMode('dark') },
      { id: 'theme-light', group: 'Appearance', label: 'Light theme', icon: 'sun', run: () => setMode('light') },
      { id: 'theme-system', group: 'Appearance', label: 'System theme', icon: 'monitor', run: () => setMode('system') },
      { id: 'sidebar', group: 'Appearance', label: collapsed ? 'Expand sidebar' : 'Collapse sidebar', icon: 'panelLeft', run: () => setCollapsed((c) => !c) }
    )
    return list
  }, [navigate, status, running, dash?.task, dash?.browser, collapsed, setMode, toast])

  const info = routeInfo(route)
  return (
    <div className="app-shell" data-collapsed={collapsed} data-drawer={drawer}>
      <a href="#main" className="skip-link" onClick={(e) => {
        e.preventDefault()
        document.getElementById('main')?.focus()
      }}>
        Skip to content
      </a>
      <VerilumenSidebar route={route} navigate={navigate} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} errorCount={errors?.length ?? 0} />
      <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn topbar-menu" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <Icon name="menu" />
            </button>
            <Breadcrumbs items={[{ label: 'Verilumen', onClick: () => navigate('dashboard') }, { label: info.group }, { label: info.label }]} />
          </div>
          <div className="topbar-right">
            <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Search and commands (Ctrl+K)">
              <Icon name="search" size={14} />
              <span>Search or run a command</span>
              <kbd>Ctrl K</kbd>
            </button>
            <SystemStatus dash={dash} />
            <NotificationCenter dash={dash} events={events} onOpenLog={() => navigate('activity')} />
            <ThemeSwitcher />
          </div>
        </header>
        <div className="app-scroll" ref={scrollRef}>
          <main id="main" tabIndex={-1} style={{ outline: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {children}
          </main>
          <AppFooter />
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
    </div>
  )
}

function VerilumenSidebar({
  route,
  navigate,
  collapsed,
  onToggle,
  errorCount
}: {
  route: RouteId
  navigate: (r: RouteId) => void
  collapsed: boolean
  onToggle: () => void
  errorCount: number
}) {
  const { dash } = useAppData()
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  useEffect(() => localStorage.setItem(GROUPS_KEY, JSON.stringify(closed)), [closed])
  const c = dash?.counts
  const counts: Partial<Record<RouteId, { n: number; tone?: 'critical' }>> = {
    companies: c ? { n: c.companiesTotal } : undefined,
    employees: c ? { n: c.employees } : undefined,
    qualified: c ? { n: c.qualified } : undefined,
    errors: errorCount ? { n: errorCount, tone: 'critical' } : undefined
  }
  const task = dash?.task
  const ts = task ? TASK_STATUS[task.status] : null

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-head">
        <Logo height={collapsed ? 26 : 24} maxWidth={collapsed ? 36 : 180} />
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {GROUPS.map((g) => {
          const open = collapsed || !closed.includes(g)
          const items = ROUTES.filter((r) => r.group === g)
          const gid = `nav-group-${g}`
          return (
            <div key={g} className="nav-group">
              <button className="nav-group-toggle" aria-expanded={open} aria-controls={gid} onClick={() => setClosed((xs) => (xs.includes(g) ? xs.filter((x) => x !== g) : [...xs, g]))}>
                {g}
                <Icon name="chevronDown" size={12} />
              </button>
              {open && (
                <ul id={gid} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map((r) => (
                    <li key={r.id}>
                      <button className="nav-item" aria-current={route === r.id ? 'page' : undefined} onClick={() => navigate(r.id)} title={collapsed ? r.label : undefined} aria-label={collapsed ? r.label : undefined}>
                        <span className="nav-icon">
                          <Icon name={r.icon} size={16} />
                        </span>
                        <span className="nav-label">{r.label}</span>
                        {counts[r.id] && counts[r.id]!.n > 0 && (
                          <span className="nav-count" data-tone={counts[r.id]!.tone}>
                            {counts[r.id]!.n.toLocaleString()}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        {dash && (
          <div className="sidebar-sys" aria-label="Session summary">
            <Led tone={dash.browser === 'CONNECTED' ? 'success' : 'neutral'} />
            <span>Browser</span>
            <span className="num">{dash.browser === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'}</span>
            <Led tone={ts?.tone ?? 'neutral'} pulse={task?.status === 'RUNNING'} />
            <span>Task</span>
            <span className="num">{ts ? ts.label.toUpperCase() : 'NONE'}</span>
          </div>
        )}
        <button className="nav-item sidebar-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          <span className="nav-icon">
            <Icon name="panelLeft" size={16} />
          </span>
          <span className="nav-label sidebar-collapse-label">Collapse</span>
        </button>
      </div>
    </aside>
  )
}

function AppFooter() {
  const { appName, taskId } = useAppData()
  return (
    <footer className="app-footer">
      <div className="row">
        <Logo height={14} maxWidth={90} />
        <span>Verilumen Labs &middot; Semiconductor Test Intelligence</span>
      </div>
      <div className="row">
        <span>{appName}</span>
        {taskId && <span className="num">TASK {taskId.slice(0, 8).toUpperCase()}</span>}
        <span>Local data &middot; keys in OS key store</span>
      </div>
    </footer>
  )
}
