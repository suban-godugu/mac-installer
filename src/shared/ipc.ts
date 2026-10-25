import type { AppSettings } from './config'
import type { HumanReason, TaskStage, TaskStatus, CompanyRecord, ProspectRow } from './schemas'

export type AuthState = 'UNKNOWN' | 'AUTHENTICATED' | 'NOT_AUTHENTICATED'
export type AiState = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR'
export type AiKind = 'controller' | 'research'

export interface ProfileInfo {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export interface TaskSummary {
  id: string
  name: string
  status: TaskStatus
  stage: TaskStage
  created_at: string
  updated_at: string
}

export interface TaskCounts {
  companiesTotal: number
  companiesDone: number
  companiesFailed: number
  employees: number
  qualified: number
  tier1: number
  tier2: number
  tier3: number
  businessEmails: number
}

export interface DashboardState {
  browser: 'CONNECTED' | 'DISCONNECTED'
  profileId: string | null
  google: AuthState
  zoominfo: AuthState
  controllerAi: AiState
  researchAi: AiState
  task: TaskSummary | null
  counts: TaskCounts
  human: { reason: HumanReason; message: string } | null
  lastExportPath: string | null
}

export interface ActivityEvent {
  id: number
  task_id: string | null
  ts: string
  level: 'info' | 'success' | 'warn' | 'error' | 'progress'
  message: string
}

export interface ErrorEntry {
  id: number
  task_id: string
  ts: string
  stage: string
  company_id: string | null
  kind: string
  message: string
}

export interface StartTaskOptions {
  name?: string
  maxCompanies?: number
  resumeTaskId?: string
}

export interface RendererApi {
  getAppName(): Promise<string>
  profiles: {
    list(): Promise<ProfileInfo[]>
    create(name: string): Promise<ProfileInfo>
    rename(id: string, name: string): Promise<void>
    remove(id: string): Promise<void>
  }
  browser: {
    start(profileId: string): Promise<void>
    stop(): Promise<void>
    openGoogle(): Promise<void>
    openZoomInfo(): Promise<void>
    checkAuth(): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<void>
    reset(): Promise<AppSettings>
    setApiKey(kind: AiKind, key: string): Promise<void>
    hasApiKey(kind: AiKind): Promise<boolean>
    testConnection(kind: AiKind): Promise<{ ok: boolean; message: string }>
  }
  task: {
    start(opts: StartTaskOptions): Promise<string>
    pause(): Promise<void>
    resume(): Promise<void>
    stop(): Promise<void>
    retry(): Promise<void>
    exportExcel(): Promise<string>
    list(): Promise<TaskSummary[]>
    select(taskId: string): Promise<void>
  }
  data: {
    companies(taskId: string): Promise<CompanyRecord[]>
    prospects(taskId: string, qualifiedOnly: boolean): Promise<ProspectRow[]>
    errors(taskId: string): Promise<ErrorEntry[]>
    activity(taskId: string | null, limit: number): Promise<ActivityEvent[]>
  }
  getDashboard(): Promise<DashboardState>
  onDashboard(cb: (s: DashboardState) => void): () => void
  onActivity(cb: (e: ActivityEvent) => void): () => void
}

export const IPC = {
  appName: 'app:name',
  profilesList: 'profiles:list',
  profilesCreate: 'profiles:create',
  profilesRename: 'profiles:rename',
  profilesRemove: 'profiles:remove',
  browserStart: 'browser:start',
  browserStop: 'browser:stop',
  browserOpenGoogle: 'browser:openGoogle',
  browserOpenZoomInfo: 'browser:openZoomInfo',
  browserCheckAuth: 'browser:checkAuth',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsReset: 'settings:reset',
  settingsSetKey: 'settings:setKey',
  settingsHasKey: 'settings:hasKey',
  settingsTest: 'settings:test',
  taskStart: 'task:start',
  taskPause: 'task:pause',
  taskResume: 'task:resume',
  taskStop: 'task:stop',
  taskRetry: 'task:retry',
  taskExport: 'task:export',
  taskList: 'task:list',
  taskSelect: 'task:select',
  dataCompanies: 'data:companies',
  dataProspects: 'data:prospects',
  dataErrors: 'data:errors',
  dataActivity: 'data:activity',
  dashboardGet: 'dashboard:get',
  evDashboard: 'ev:dashboard',
  evActivity: 'ev:activity'
} as const
