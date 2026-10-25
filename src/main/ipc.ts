import { ipcMain } from 'electron'
import { APP_NAME, type AppSettings } from '@shared/config'
import { IPC, type AiKind, type StartTaskOptions } from '@shared/ipc'
import type { Repos } from './data/repositories'
import type { SecretStore } from './secrets'
import type { BrowserSessionManager } from './browser/sessionManager'
import type { OpenRouterClient } from './agents/openrouterClient'
import type { TaskManager } from './workflow/taskManager'
import { observe } from './browser/pageObserver'
import { baseHostOf, googleAuthenticated, siteAuthenticated } from './zoominfo/detectors'
import { validateRows } from './data/validation'
import { log } from './logger'

interface IpcDeps {
  repos: Repos
  secrets: SecretStore
  session: BrowserSessionManager
  tm: TaskManager
  clients: Record<AiKind, OpenRouterClient>
  settings: () => AppSettings
  refreshAiStates: () => void
  pushDashboard: () => void
  send: (channel: string, payload: unknown) => void
}

const str = (v: unknown, max = 500): string => {
  if (typeof v !== 'string') throw new Error('Expected a string')
  return v.slice(0, max)
}
const kindOf = (v: unknown): AiKind => {
  if (v !== 'controller' && v !== 'research') throw new Error('Unknown AI kind')
  return v
}

export function registerIpc(d: IpcDeps): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...args)
      } catch (err) {
        log().warn({ channel, err: String(err) }, 'ipc error')
        throw err
      }
    })
  }

  handle(IPC.appName, () => APP_NAME)

  handle(IPC.profilesList, () => d.session.listProfiles().map(({ dir: _dir, ...p }) => p))
  handle(IPC.profilesCreate, (name) => {
    const { dir: _dir, ...p } = d.session.createProfile(str(name, 80))
    return p
  })
  handle(IPC.profilesRename, (id, name) => d.session.renameProfile(str(id), str(name, 80)))
  handle(IPC.profilesRemove, async (id) => {
    if (d.tm.isRunning()) throw new Error('Stop the running task before deleting a profile')
    await d.session.deleteProfile(str(id))
  })

  const checkAuth = async (): Promise<void> => {
    if (d.tm.isRunning()) return
    const s = d.settings()
    const cfg = { siteBaseHost: baseHostOf(s.search.zoominfoStartUrl) || 'zoominfo.com' }
    const { tabId, page } = await d.session.tabFor('auth')
    await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded' })
    const g = await observe(page, tabId, cfg)
    d.tm.setAuth('google', googleAuthenticated(g.detection) ? 'AUTHENTICATED' : 'NOT_AUTHENTICATED')
    const zi = await d.session.tabFor('search')
    if (!zi.page.url().includes(cfg.siteBaseHost)) {
      await zi.page.goto(s.search.zoominfoStartUrl, { waitUntil: 'domcontentloaded' })
    }
    await zi.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
    const z = await observe(zi.page, zi.tabId, cfg)
    d.tm.setAuth('zoominfo', siteAuthenticated(z.detection) ? 'AUTHENTICATED' : 'NOT_AUTHENTICATED')
  }

  handle(IPC.browserStart, async (id) => {
    await d.session.start(str(id))
    d.pushDashboard()
    void checkAuth().catch((err) => log().warn({ err: String(err) }, 'initial auth check failed'))
  })
  handle(IPC.browserStop, async () => {
    if (d.tm.isRunning()) throw new Error('Pause or stop the task before closing the browser')
    await d.session.stop()
    d.tm.setAuth('google', 'UNKNOWN')
    d.tm.setAuth('zoominfo', 'UNKNOWN')
  })
  handle(IPC.browserOpenGoogle, async () => {
    const { page } = await d.session.tabFor('auth')
    await page.goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded' })
    await page.bringToFront()
  })
  handle(IPC.browserOpenZoomInfo, async () => {
    const { page } = await d.session.tabFor('search')
    await page.goto(d.settings().search.zoominfoStartUrl, { waitUntil: 'domcontentloaded' })
    await page.bringToFront()
  })
  handle(IPC.browserCheckAuth, checkAuth)

  handle(IPC.settingsGet, () => d.settings())
  handle(IPC.settingsSave, (s) => {
    if (!s || typeof s !== 'object') throw new Error('Invalid settings')
    d.repos.settings.save(s as AppSettings)
    d.refreshAiStates()
  })
  handle(IPC.settingsReset, () => {
    const s = d.repos.settings.reset()
    d.refreshAiStates()
    return s
  })
  handle(IPC.settingsSetKey, (kind, key) => {
    d.secrets.set(kindOf(kind), str(key, 400))
    d.refreshAiStates()
  })
  handle(IPC.settingsHasKey, (kind) => d.secrets.has(kindOf(kind)))
  handle(IPC.settingsTest, async (kind) => {
    const k = kindOf(kind)
    const res = await d.clients[k].testConnection()
    d.tm.setAi(k, res.ok ? 'CONNECTED' : 'ERROR')
    return res
  })

  handle(IPC.taskStart, (opts) => d.tm.start((opts ?? {}) as StartTaskOptions))
  handle(IPC.taskPause, () => d.tm.pause())
  handle(IPC.taskResume, () => d.tm.resume())
  handle(IPC.taskStop, () => d.tm.stop())
  handle(IPC.taskRetry, () => d.tm.retry())
  handle(IPC.taskExport, () => d.tm.exportNow())
  handle(IPC.taskList, () => d.repos.tasks.list())
  handle(IPC.taskSelect, (id) => d.tm.select(str(id)))

  handle(IPC.dataCompanies, (taskId) => d.repos.research.companies(str(taskId)))
  handle(IPC.dataProspects, (taskId, qualifiedOnly) => {
    const rows = validateRows(d.repos.research.prospects(str(taskId)))
    return qualifiedOnly ? rows.filter((r) => r.relevant) : rows
  })
  handle(IPC.dataErrors, (taskId) => d.repos.tasks.errors(str(taskId)))
  handle(IPC.dataActivity, (taskId, limit) =>
    d.repos.tasks.activity(taskId ? str(taskId) : null, Math.min(2000, Number(limit) || 200))
  )
  handle(IPC.dashboardGet, () => d.tm.dashboard(d.session.isRunning(), d.session.currentProfileId()))
}
