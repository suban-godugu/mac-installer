import { join } from 'node:path'
import { app, BrowserWindow, safeStorage, shell } from 'electron'
import { APP_NAME } from '@shared/config'
import { IPC, type AiKind } from '@shared/ipc'
import { initLogger, log } from './logger'
import { openDb } from './data/db'
import { createRepos } from './data/repositories'
import { SecretStore, electronCipher } from './secrets'
import { loadDotEnv } from './env'
import { BrowserSessionManager } from './browser/sessionManager'
import { ActionExecutor } from './browser/actionExecutor'
import { OpenRouterClient } from './agents/openrouterClient'
import { ControllerAgent } from './agents/controllerAgent'
import { ResearchAgent } from './agents/researchAgent'
import { TaskManager } from './workflow/taskManager'
import { registerIpc } from './ipc'
import type { Page } from 'playwright-core'
import type { AppSettings } from '@shared/config'
import { snapshot } from './browser/pageObserver'
import { baseHostOf, detectPage, siteAuthenticated } from './zoominfo/detectors'

app.setName(APP_NAME)
let mainWindow: BrowserWindow | null = null
let appReady = false

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: '#02060a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  initLogger(join(userData, 'logs'))
  loadDotEnv([process.cwd(), userData])

  const db = openDb(join(userData, 'data', 'app.db'))
  const repos = createRepos(db)
  const secrets = new SecretStore(repos.settings, electronCipher(safeStorage))
  seedFromEnv(repos, secrets)

  const settings = (): ReturnType<typeof repos.settings.get> => repos.settings.get()
  const session = new BrowserSessionManager(repos.profiles, join(userData, 'profiles'))
  const executor = new ActionExecutor(session, () => settings().runtime)

  const clients: Record<AiKind, OpenRouterClient> = {
    controller: new OpenRouterClient({
      apiKey: () => secrets.get('controller'),
      model: () => settings().ai.controllerModel,
      label: 'Controller',
      timeoutMs: settings().runtime.aiTimeoutMs,
      attempts: settings().runtime.retryAttempts,
      baseDelayMs: settings().runtime.retryBaseDelayMs
    }),
    research: new OpenRouterClient({
      apiKey: () => secrets.get('research'),
      model: () => settings().ai.researchModel,
      label: 'Research',
      timeoutMs: settings().runtime.aiTimeoutMs * 2,
      attempts: settings().runtime.retryAttempts,
      baseDelayMs: settings().runtime.retryBaseDelayMs
    })
  }

  const send = (channel: string, payload: unknown): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }

  const tm = new TaskManager(
    {
      repos,
      session,
      executor,
      controller: new ControllerAgent(clients.controller),
      research: new ResearchAgent(clients.research),
      outputDir: join(app.getPath('documents'), APP_NAME, 'exports'),
      onActivity: (e) => send(IPC.evActivity, e)
    },
    settings
  )

  const refreshAiStates = (): void => {
    for (const kind of ['controller', 'research'] as AiKind[]) {
      const model = kind === 'controller' ? settings().ai.controllerModel : settings().ai.researchModel
      tm.setAi(kind, secrets.has(kind) && model.trim() ? 'CONFIGURED' : 'NOT_CONFIGURED')
    }
  }
  refreshAiStates()

  let pending: NodeJS.Timeout | null = null
  const pushDashboard = (): void => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      send(IPC.evDashboard, tm.dashboard(session.isRunning(), session.currentProfileId()))
    }, 150)
  }
  tm.onStateChange = pushDashboard
  session.onStateChange = pushDashboard
  watchAuth(session, tm, settings)

  registerIpc({ repos, secrets, session, tm, clients, settings, refreshAiStates, pushDashboard, send })

  mainWindow = createWindow()
  appReady = true

  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting) return
    quitting = true
    e.preventDefault()
    const running = tm.isRunning()
    const taskId = tm.selectedTask()
    void (async () => {
      await tm.stop().catch(() => undefined)
      if (running && taskId) repos.tasks.setStatus(taskId, 'PAUSED')
      await session.stop().catch(() => undefined)
      db.close()
      app.quit()
    })()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (appReady && BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
})

process.on('unhandledRejection', (err) => log().error({ err: String(err) }, 'unhandled rejection'))

/** Updates Google / ZoomInfo status as the user signs in by hand, so no manual re-check is needed. */
function watchAuth(session: BrowserSessionManager, tm: TaskManager, settings: () => AppSettings): void {
  const timers = new WeakMap<Page, NodeJS.Timeout>()
  session.tabs.onNavigate = (page) => {
    clearTimeout(timers.get(page))
    timers.set(
      page,
      setTimeout(() => {
        if (tm.isRunning() || page.isClosed()) return
        const cfg = { siteBaseHost: baseHostOf(settings().search.zoominfoStartUrl) || 'zoominfo.com' }
        void snapshot(page)
          .then((raw) => {
            const det = detectPage(raw, cfg)
            if (det.kind === 'google_account') tm.setAuth('google', 'AUTHENTICATED')
            else if (det.kind === 'google_signin') tm.setAuth('google', 'NOT_AUTHENTICATED')
            else if (siteAuthenticated(det)) tm.setAuth('zoominfo', 'AUTHENTICATED')
            else if (det.kind === 'zoominfo_login') tm.setAuth('zoominfo', 'NOT_AUTHENTICATED')
          })
          .catch(() => undefined)
      }, 1500)
    )
  }
}

function seedFromEnv(repos: ReturnType<typeof createRepos>, secrets: SecretStore): void {
  const s = repos.settings.get()
  let changed = false
  const pairs: [AiKind, string, 'controllerModel' | 'researchModel'][] = [
    ['controller', 'OPENROUTER_CONTROLLER', 'controllerModel'],
    ['research', 'OPENROUTER_RESEARCH', 'researchModel']
  ]
  for (const [kind, prefix, modelKey] of pairs) {
    const key = process.env[`${prefix}_API_KEY`]
    const model = process.env[`${prefix}_MODEL`]
    if (key && !secrets.has(kind)) {
      try {
        secrets.set(kind, key)
      } catch (err) {
        log().warn({ err: String(err) }, 'could not seed API key')
      }
    }
    if (model && !s.ai[modelKey]) {
      s.ai[modelKey] = model
      changed = true
    }
  }
  if (changed) repos.settings.save(s)
}
