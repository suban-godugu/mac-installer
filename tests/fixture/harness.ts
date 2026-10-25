import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings } from '../../src/shared/config'
import type { ActivityEvent } from '../../src/shared/ipc'
import { openDb } from '../../src/main/data/db'
import { createRepos, type Repos } from '../../src/main/data/repositories'
import { BrowserSessionManager } from '../../src/main/browser/sessionManager'
import { ActionExecutor } from '../../src/main/browser/actionExecutor'
import { ControllerAgent } from '../../src/main/agents/controllerAgent'
import { ResearchAgent } from '../../src/main/agents/researchAgent'
import { TaskManager } from '../../src/main/workflow/taskManager'
import { sleep } from '../../src/main/agents/openrouterClient'
import { startFixtureSite } from './site'
import { MockControllerLlm, MockResearchLlm } from './mockLlm'

export interface FixtureRunResult {
  repos: Repos
  taskId: string
  activity: ActivityEvent[]
  humanEvents: string[]
  controllerCalls: number
  researchCalls: number
  close(): Promise<void>
}

export interface FixtureRunOptions {
  workDir: string
  maxCompanies?: number
  headless?: boolean
  /** Stop the task once this many companies are completed, then resume it (tests checkpoint/resume). */
  interruptAfterCompanies?: number
}

export async function runFixtureWorkflow(opts: FixtureRunOptions): Promise<FixtureRunResult> {
  rmSync(opts.workDir, { recursive: true, force: true })
  mkdirSync(opts.workDir, { recursive: true })
  const site = await startFixtureSite()
  const db = openDb(join(opts.workDir, 'test.db'))
  const repos = createRepos(db)

  const settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  settings.search.zoominfoStartUrl = site.url
  settings.search.requireGoogleAuth = false
  settings.search.maxCompanies = opts.maxCompanies ?? 3
  settings.search.name = 'Fixture Prospect Research (TEST DATA)'
  settings.runtime = {
    ...settings.runtime,
    allowedDomains: ['127.0.0.1'],
    actionsPerMinute: 10000,
    pageOpensPerMinute: 10000,
    minActionDelayMs: 0,
    retryBaseDelayMs: 10
  }
  settings.output.outputDir = join(opts.workDir, 'exports')
  repos.settings.save(settings)

  const session = new BrowserSessionManager(repos.profiles, join(opts.workDir, 'profiles'), { headless: opts.headless ?? true })
  const profile = session.createProfile('Fixture')
  await session.start(profile.id)

  const controllerLlm = new MockControllerLlm()
  const researchLlm = new MockResearchLlm()
  const activity: ActivityEvent[] = []
  const tm = new TaskManager(
    {
      repos,
      session,
      executor: new ActionExecutor(session, () => repos.settings.get().runtime),
      controller: new ControllerAgent(controllerLlm),
      research: new ResearchAgent(researchLlm),
      outputDir: join(opts.workDir, 'exports'),
      onActivity: (e) => activity.push(e)
    },
    () => repos.settings.get()
  )

  const humanEvents: string[] = []
  const actAsHuman = async (): Promise<void> => {
    const human = tm.dashboard(true, profile.id).human
    if (!human) return
    humanEvents.push(human.reason)
    // The test plays the user: it logs in on the site's own form. The app never types credentials.
    for (const t of session.tabs.list()) {
      const entry = session.tabs.get(t.tab_id)
      if (entry && entry.page.url().includes('/login')) {
        await entry.page.fill('#u', 'tester@example.com')
        await entry.page.fill('#p', 'not-a-real-password')
        await entry.page.click('button[type=submit]')
      }
    }
  }

  const drive = async (): Promise<void> => {
    const deadline = Date.now() + 120000
    while (tm.isRunning() && Date.now() < deadline) {
      await actAsHuman()
      if (opts.interruptAfterCompanies && repos.research.counts(taskId).companiesDone >= opts.interruptAfterCompanies) {
        opts.interruptAfterCompanies = undefined
        await tm.stop()
        break
      }
      await sleep(300)
    }
  }

  const taskId = await tm.start({ name: settings.search.name })
  await drive()
  if (repos.tasks.get(taskId)?.status === 'STOPPED') {
    await tm.start({ resumeTaskId: taskId })
    await drive()
  }
  await tm.whenIdle()

  return {
    repos,
    taskId,
    activity,
    humanEvents,
    controllerCalls: controllerLlm.calls,
    researchCalls: researchLlm.calls,
    close: async () => {
      await session.stop()
      db.close()
      await site.close()
    }
  }
}
