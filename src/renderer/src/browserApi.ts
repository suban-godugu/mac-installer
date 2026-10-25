import { APP_NAME, DEFAULT_SETTINGS, type AppSettings } from '@shared/config'
import type { ActivityEvent, AiKind, AiState, AuthState, DashboardState, ErrorEntry, ProfileInfo, RendererApi, StartTaskOptions, TaskCounts, TaskSummary } from '@shared/ipc'
import type { CompanyRecord, ProspectRow } from '@shared/schemas'

const STORAGE_KEY = 'verilumen-browser-app'

interface StoredProspect {
  task_id: string
  row: ProspectRow
}

interface State {
  profiles: ProfileInfo[]
  connected: boolean
  profileId: string | null
  google: AuthState
  zoominfo: AuthState
  settings: AppSettings
  keys: Record<AiKind, string>
  tasks: TaskSummary[]
  selectedTaskId: string | null
  companies: CompanyRecord[]
  prospects: StoredProspect[]
  errors: ErrorEntry[]
  activity: ActivityEvent[]
  lastExportPath: string | null
  nextEventId: number
}

const empty = (): State => ({
  profiles: [],
  connected: false,
  profileId: null,
  google: 'UNKNOWN',
  zoominfo: 'UNKNOWN',
  settings: structuredClone(DEFAULT_SETTINGS),
  keys: { controller: '', research: '' },
  tasks: [],
  selectedTaskId: null,
  companies: [],
  prospects: [],
  errors: [],
  activity: [],
  lastExportPath: null,
  nextEventId: 1
})

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const stored = JSON.parse(raw) as Partial<State>
    const base = empty()
    return {
      ...base,
      ...stored,
      settings: mergeSettings(stored.settings),
      keys: { ...base.keys, ...stored.keys },
      profiles: stored.profiles ?? [],
      tasks: stored.tasks ?? [],
      companies: stored.companies ?? [],
      prospects: stored.prospects ?? [],
      errors: stored.errors ?? [],
      activity: stored.activity ?? []
    }
  } catch {
    return empty()
  }
}

function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  const merged = structuredClone(DEFAULT_SETTINGS)
  if (!stored) return merged
  for (const key of Object.keys(merged) as (keyof AppSettings)[]) {
    if (stored[key]) Object.assign(merged[key], stored[key])
  }
  return merged
}

function aiState(kind: AiKind, state: State): AiState {
  const model = kind === 'controller' ? state.settings.ai.controllerModel : state.settings.ai.researchModel
  return state.keys[kind] && model.trim() ? 'CONFIGURED' : 'NOT_CONFIGURED'
}

function countsFor(state: State, taskId: string): TaskCounts {
  const companies = state.companies.filter((c) => c.task_id === taskId)
  const prospects = state.prospects.filter((p) => p.task_id === taskId).map((p) => p.row)
  return {
    companiesTotal: companies.length,
    companiesDone: companies.filter((c) => c.status === 'COMPLETED').length,
    companiesFailed: companies.filter((c) => c.status === 'FAILED' || c.status === 'NEEDS_HUMAN').length,
    employees: prospects.length,
    qualified: prospects.filter((p) => p.relevant).length,
    tier1: prospects.filter((p) => p.priority === 'Tier 1').length,
    tier2: prospects.filter((p) => p.priority === 'Tier 2').length,
    tier3: prospects.filter((p) => p.priority === 'Tier 3').length,
    businessEmails: prospects.filter((p) => p.employee_email && p.employee_email !== 'NOT_AVAILABLE').length
  }
}

function dashboardOf(state: State): DashboardState {
  const task = state.tasks.find((t) => t.id === state.selectedTaskId) ?? null
  const emptyCounts = { companiesTotal: 0, companiesDone: 0, companiesFailed: 0, employees: 0, qualified: 0, tier1: 0, tier2: 0, tier3: 0, businessEmails: 0 }
  return {
    browser: state.connected ? 'CONNECTED' : 'DISCONNECTED',
    profileId: state.profileId,
    google: state.google,
    zoominfo: state.zoominfo,
    controllerAi: aiState('controller', state),
    researchAi: aiState('research', state),
    task,
    counts: task ? countsFor(state, task.id) : emptyCounts,
    human: null,
    lastExportPath: state.lastExportPath
  }
}

const csvCell = (value: string | number): string => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadProspects(rows: ProspectRow[]): string {
  const headers = ['Company Name', 'Employee Name', 'Employee Role', 'Employee Business Email', 'Department', 'Priority', 'Relevance Score', 'Qualification Reason']
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.company_name,
        r.employee_name,
        r.employee_role,
        r.employee_email,
        r.department,
        r.priority,
        r.relevance_score ?? '',
        r.reason
      ]
        .map(csvCell)
        .join(',')
    )
  ]
  const name = 'verilumen-prospects.csv'
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
  return name
}

/** In-browser stand-in for the desktop bridge, so the same screens open from one HTML file. */
export function installBrowserApi(): void {
  const state = load()
  const onDashboard = new Set<(s: DashboardState) => void>()
  const onActivity = new Set<(e: ActivityEvent) => void>()

  const persist = (): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const dash = dashboardOf(state)
    onDashboard.forEach((cb) => cb(dash))
  }

  const activity = (level: ActivityEvent['level'], message: string, taskId: string | null = state.selectedTaskId): void => {
    const event: ActivityEvent = { id: state.nextEventId++, task_id: taskId, ts: new Date().toISOString(), level, message }
    state.activity = [...state.activity, event].slice(-400)
    onActivity.forEach((cb) => cb(event))
  }

  const requireTask = (): TaskSummary => {
    const task = state.tasks.find((t) => t.id === state.selectedTaskId)
    if (!task) throw new Error('No task selected')
    return task
  }

  const touch = (task: TaskSummary, status: TaskSummary['status']): void => {
    task.status = status
    task.updated_at = new Date().toISOString()
  }

  const openSite = (url: string): void => {
    const opened = window.open(url, '_blank', 'noopener')
    if (!opened) throw new Error('The browser blocked the new tab. Allow pop-ups for this page.')
  }

  const api: RendererApi = {
    getAppName: async () => APP_NAME,
    profiles: {
      list: async () => state.profiles.map((p) => ({ ...p })),
      create: async (name) => {
        const now = new Date().toISOString()
        const profile: ProfileInfo = { id: `profile_${crypto.randomUUID()}`, name: name.trim(), created_at: now, last_used_at: null }
        state.profiles = [...state.profiles, profile]
        activity('success', `Browser profile “${profile.name}” created`, null)
        persist()
        return { ...profile }
      },
      rename: async (id, name) => {
        const profile = state.profiles.find((p) => p.id === id)
        if (!profile) throw new Error('Profile not found')
        profile.name = name.trim()
        persist()
      },
      remove: async (id) => {
        state.profiles = state.profiles.filter((p) => p.id !== id)
        if (state.profileId === id) {
          state.profileId = null
          state.connected = false
        }
        activity('info', 'Browser profile deleted', null)
        persist()
      }
    },
    browser: {
      start: async (profileId) => {
        const profile = state.profiles.find((p) => p.id === profileId)
        if (!profile) throw new Error('Profile not found')
        profile.last_used_at = new Date().toISOString()
        state.profileId = profileId
        state.connected = true
        activity('success', `Browser session “${profile.name}” is ready in this window`, null)
        persist()
      },
      stop: async () => {
        state.connected = false
        activity('info', 'Browser session closed', null)
        persist()
      },
      openGoogle: async () => {
        openSite('https://accounts.google.com/')
        state.google = 'UNKNOWN'
        activity('info', 'Opened Google sign-in in a new tab', null)
        persist()
      },
      openZoomInfo: async () => {
        openSite(state.settings.search.zoominfoStartUrl || 'https://app.zoominfo.com/')
        state.zoominfo = 'UNKNOWN'
        activity('info', 'Opened ZoomInfo in a new tab', null)
        persist()
      },
      checkAuth: async () => {
        activity('warn', 'This browser file cannot see whether Google or ZoomInfo is signed in', null)
        persist()
      }
    },
    settings: {
      get: async () => structuredClone(state.settings),
      save: async (settings) => {
        state.settings = structuredClone(settings)
        activity('success', 'Settings saved in this browser', null)
        persist()
      },
      reset: async () => {
        state.settings = structuredClone(DEFAULT_SETTINGS)
        activity('info', 'Settings reset to defaults', null)
        persist()
        return structuredClone(state.settings)
      },
      setApiKey: async (kind, key) => {
        state.keys[kind] = key.trim()
        persist()
      },
      hasApiKey: async (kind) => state.keys[kind].length > 0,
      testConnection: async (kind) => {
        const key = state.keys[kind]
        const model = kind === 'controller' ? state.settings.ai.controllerModel : state.settings.ai.researchModel
        if (!key) return { ok: false, message: 'No API key saved' }
        if (!model.trim()) return { ok: false, message: 'Set a model, then save settings' }
        try {
          const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } })
          if (!res.ok) return { ok: false, message: `OpenRouter returned ${res.status}` }
          return { ok: true, message: `Connected (${model.trim()})` }
        } catch {
          return { ok: false, message: 'This browser blocked the connection test. Open the HTML file over http, or use the desktop app.' }
        }
      }
    },
    task: {
      start: async (opts: StartTaskOptions) => {
        const now = new Date().toISOString()
        const task: TaskSummary = {
          id: `task_${crypto.randomUUID()}`,
          name: opts.name?.trim() || 'Verilumen Prospect Research',
          status: 'STOPPED',
          stage: 'INIT',
          created_at: now,
          updated_at: now
        }
        state.tasks = [task, ...state.tasks]
        state.selectedTaskId = task.id
        if (opts.maxCompanies && opts.maxCompanies > 0) state.settings.search.maxCompanies = opts.maxCompanies
        activity('warn', 'Task saved. Live ZoomInfo collection runs in the desktop app. This page keeps your workspace and export.', task.id)
        persist()
        return task.id
      },
      pause: async () => {
        touch(requireTask(), 'PAUSED')
        activity('info', 'Task paused')
        persist()
      },
      resume: async () => {
        const task = requireTask()
        touch(task, 'STOPPED')
        activity('warn', 'Live collection is not available in this HTML file', task.id)
        persist()
      },
      stop: async () => {
        touch(requireTask(), 'STOPPED')
        activity('info', 'Task stopped')
        persist()
      },
      retry: async () => {
        const task = requireTask()
        touch(task, 'STOPPED')
        activity('warn', 'Retry needs the desktop app', task.id)
        persist()
      },
      exportExcel: async () => {
        const task = requireTask()
        const rows = state.prospects.filter((p) => p.task_id === task.id).map((p) => p.row)
        const name = downloadProspects(rows)
        state.lastExportPath = name
        activity('success', `Exported ${rows.length} rows to ${name}`, task.id)
        persist()
        return name
      },
      list: async () => state.tasks.map((t) => ({ ...t })),
      select: async (taskId) => {
        if (!state.tasks.some((t) => t.id === taskId)) throw new Error('Task not found')
        state.selectedTaskId = taskId
        persist()
      }
    },
    data: {
      companies: async (taskId) => state.companies.filter((c) => c.task_id === taskId).map((c) => ({ ...c })),
      prospects: async (taskId, qualifiedOnly) =>
        state.prospects.filter((p) => p.task_id === taskId && (!qualifiedOnly || p.row.relevant)).map((p) => ({ ...p.row })),
      errors: async (taskId) => state.errors.filter((e) => e.task_id === taskId).map((e) => ({ ...e })),
      activity: async (taskId, limit) => state.activity.filter((e) => !taskId || e.task_id === taskId || e.task_id === null).slice(-limit)
    },
    getDashboard: async () => dashboardOf(state),
    onDashboard: (cb) => {
      onDashboard.add(cb)
      return () => onDashboard.delete(cb)
    },
    onActivity: (cb) => {
      onActivity.add(cb)
      return () => onActivity.delete(cb)
    }
  }

  window.api = api
}
