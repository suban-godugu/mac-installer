import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RendererApi, type ActivityEvent, type DashboardState } from '../shared/ipc'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RendererApi = {
  getAppName: () => invoke(IPC.appName),
  profiles: {
    list: () => invoke(IPC.profilesList),
    create: (name) => invoke(IPC.profilesCreate, name),
    rename: (id, name) => invoke(IPC.profilesRename, id, name),
    remove: (id) => invoke(IPC.profilesRemove, id)
  },
  browser: {
    start: (id) => invoke(IPC.browserStart, id),
    stop: () => invoke(IPC.browserStop),
    openGoogle: () => invoke(IPC.browserOpenGoogle),
    openZoomInfo: () => invoke(IPC.browserOpenZoomInfo),
    checkAuth: () => invoke(IPC.browserCheckAuth)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    save: (s) => invoke(IPC.settingsSave, s),
    reset: () => invoke(IPC.settingsReset),
    setApiKey: (kind, key) => invoke(IPC.settingsSetKey, kind, key),
    hasApiKey: (kind) => invoke(IPC.settingsHasKey, kind),
    testConnection: (kind) => invoke(IPC.settingsTest, kind)
  },
  task: {
    start: (opts) => invoke(IPC.taskStart, opts),
    pause: () => invoke(IPC.taskPause),
    resume: () => invoke(IPC.taskResume),
    stop: () => invoke(IPC.taskStop),
    retry: () => invoke(IPC.taskRetry),
    exportExcel: () => invoke(IPC.taskExport),
    list: () => invoke(IPC.taskList),
    select: (id) => invoke(IPC.taskSelect, id)
  },
  data: {
    companies: (taskId) => invoke(IPC.dataCompanies, taskId),
    prospects: (taskId, qualifiedOnly) => invoke(IPC.dataProspects, taskId, qualifiedOnly),
    errors: (taskId) => invoke(IPC.dataErrors, taskId),
    activity: (taskId, limit) => invoke(IPC.dataActivity, taskId, limit)
  },
  getDashboard: () => invoke(IPC.dashboardGet),
  onDashboard: (cb) => subscribe<DashboardState>(IPC.evDashboard, cb),
  onActivity: (cb) => subscribe<ActivityEvent>(IPC.evActivity, cb)
}

contextBridge.exposeInMainWorld('api', api)
