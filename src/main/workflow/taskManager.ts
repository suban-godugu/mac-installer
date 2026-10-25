import type { AppSettings } from '@shared/config'
import { TASK_STAGES, type Checkpoint, type TaskStage } from '@shared/schemas'
import type { AiKind, AiState, AuthState, DashboardState, StartTaskOptions } from '@shared/ipc'
import { WorkflowContext, type Control, type WorkflowDeps } from './context'
import { StopSignal, errMsg, StepError } from './retry'
import { googleAuthStage, zoominfoAuthStage } from './stages/auth'
import { applyFiltersStage, collectCompaniesStage, openAdvancedSearchStage, runSearchStage } from './stages/search'
import { processCompaniesStage } from './stages/companies'
import { validateDedupExport } from './stages/finalize'
import { extractCompanyList } from '../zoominfo/extractors'
import { log } from '../logger'

type BaseDeps = Omit<WorkflowDeps, 'onStateChange' | 'setAuth'>

const stageIndex = (s: TaskStage): number => TASK_STAGES.indexOf(s)

/** Owns the task lifecycle: start, pause, resume, stop, retry, export and resume-after-restart. */
export class TaskManager {
  private ctx: WorkflowContext | null = null
  private control: Control = { stopRequested: false, pauseRequested: false, resumeWaiters: [] }
  private running: Promise<void> | null = null
  private selectedTaskId: string | null = null
  private auth: { google: AuthState; zoominfo: AuthState } = { google: 'UNKNOWN', zoominfo: 'UNKNOWN' }
  private ai: Record<AiKind, AiState> = { controller: 'NOT_CONFIGURED', research: 'NOT_CONFIGURED' }
  onStateChange: () => void = () => {}

  constructor(
    private deps: BaseDeps,
    private currentSettings: () => AppSettings
  ) {
    const unfinished = deps.repos.tasks.latestUnfinished()
    if (unfinished) {
      if (unfinished.status === 'RUNNING' || unfinished.status === 'HUMAN_ACTION_REQUIRED') {
        deps.repos.tasks.setStatus(unfinished.id, 'PAUSED')
      }
      this.selectedTaskId = unfinished.id
    }
  }

  isRunning(): boolean {
    return this.running !== null
  }

  whenIdle(): Promise<void> {
    return this.running ?? Promise.resolve()
  }

  selectedTask(): string | null {
    return this.selectedTaskId
  }

  select(taskId: string): void {
    if (this.running) throw new Error('Cannot switch tasks while a task is running')
    if (!this.deps.repos.tasks.get(taskId)) throw new Error('Task not found')
    this.selectedTaskId = taskId
    this.onStateChange()
  }

  setAuth(kind: 'google' | 'zoominfo', state: AuthState): void {
    this.auth[kind] = state
    this.onStateChange()
  }

  setAi(kind: AiKind, state: AiState): void {
    this.ai[kind] = state
    this.onStateChange()
  }

  async start(opts: StartTaskOptions = {}): Promise<string> {
    if (this.running) throw new Error('A task is already running')
    if (!this.deps.session.isRunning()) throw new Error('Start the browser (select a profile) before starting a task')

    const repos = this.deps.repos
    let taskId: string
    let settings: AppSettings
    let checkpoint: Checkpoint
    if (opts.resumeTaskId) {
      const task = repos.tasks.get(opts.resumeTaskId)
      if (!task) throw new Error('Task not found')
      taskId = task.id
      settings = JSON.parse(task.settings_json) as AppSettings
      checkpoint = repos.tasks.getCheckpoint(taskId) ?? newCheckpoint(taskId, settings)
    } else {
      settings = structuredClone(this.currentSettings())
      if (opts.maxCompanies && opts.maxCompanies > 0) settings.search.maxCompanies = Math.floor(opts.maxCompanies)
      const task = repos.tasks.create(opts.name?.trim() || settings.search.name, this.deps.session.currentProfileId(), settings)
      taskId = task.id
      checkpoint = newCheckpoint(taskId, settings)
      repos.tasks.saveCheckpoint(checkpoint)
    }

    this.selectedTaskId = taskId
    this.control = { stopRequested: false, pauseRequested: false, resumeWaiters: [] }
    const ctx = new WorkflowContext(
      taskId,
      settings,
      { ...this.deps, onStateChange: () => this.onStateChange(), setAuth: (k, s) => this.setAuth(k, s) },
      this.control,
      checkpoint
    )
    this.ctx = ctx
    this.running = this.run(ctx, Boolean(opts.resumeTaskId)).finally(() => {
      this.running = null
      this.ctx = null
      this.onStateChange()
    })
    return taskId
  }

  private async run(ctx: WorkflowContext, resuming: boolean): Promise<void> {
    const resumeFrom = ctx.checkpoint.stage
    ctx.setStatus('RUNNING')
    ctx.activity('info', resuming ? `Resuming task from stage ${resumeFrom}` : `Task started: ${ctx.settings.search.name}`)
    // Auth is re-verified on resume without moving the saved work stage backwards.
    const markAuth = (s: TaskStage): void => {
      if (!resuming || stageIndex(s) >= stageIndex(resumeFrom)) ctx.enterStage(s)
    }
    try {
      markAuth('GOOGLE_AUTH')
      await googleAuthStage(ctx)
      await ctx.checkControl()

      markAuth('ZOOMINFO_AUTH')
      let searchTab = await zoominfoAuthStage(ctx)
      await ctx.checkControl()

      const companiesQueued = ctx.repos.research.companyCount(ctx.taskId)
      const needSearch = stageIndex(resumeFrom) <= stageIndex('COLLECT_COMPANIES') || companiesQueued === 0
      if (needSearch) {
        const reopened = resumeFrom === 'COLLECT_COMPANIES' && (await this.reopenResults(ctx, searchTab))
        if (!reopened) {
          ctx.enterStage('OPEN_ADVANCED_SEARCH')
          searchTab = await openAdvancedSearchStage(ctx, searchTab)
          ctx.enterStage('APPLY_FILTERS')
          searchTab = await applyFiltersStage(ctx, searchTab)
          ctx.enterStage('RUN_SEARCH')
          searchTab = await runSearchStage(ctx, searchTab)
          ctx.checkpoint.results_page = 1
        }
        ctx.enterStage('COLLECT_COMPANIES')
        await collectCompaniesStage(ctx, searchTab)
      }

      ctx.enterStage('PROCESS_COMPANIES')
      await processCompaniesStage(ctx)

      ctx.enterStage('VALIDATE')
      ctx.enterStage('DEDUP')
      ctx.enterStage('EXPORT')
      await validateDedupExport(ctx.repos, ctx.taskId, ctx.settings, this.deps.outputDir, (l, m) => ctx.activity(l, m))

      ctx.enterStage('DONE')
      ctx.setStatus('COMPLETED')
      const c = ctx.repos.research.counts(ctx.taskId)
      ctx.activity(
        'success',
        `Research complete: ${c.companiesDone}/${c.companiesTotal} companies, ${c.employees} employees, ${c.qualified} qualified (Tier 1: ${c.tier1}, Tier 2: ${c.tier2}, Tier 3: ${c.tier3}), ${c.businessEmails} business emails`
      )
    } catch (err) {
      if (err instanceof StopSignal) {
        ctx.saveCheckpoint()
        ctx.setStatus('STOPPED')
        ctx.activity('warn', 'Task stopped. It can be resumed later from the saved checkpoint.')
        return
      }
      ctx.recordError(err instanceof StepError ? err.kind : 'TASK_FAILED', errMsg(err))
      ctx.saveCheckpoint()
      ctx.setStatus('FAILED')
      ctx.activity('error', `Task failed at ${ctx.checkpoint.stage}: ${errMsg(err)} - use Retry to continue from the checkpoint`)
      log().error({ err: String(err), stack: (err as Error).stack }, 'task failed')
    }
  }

  private async reopenResults(ctx: WorkflowContext, tabId: string): Promise<boolean> {
    if (!ctx.checkpoint.results_url) return false
    try {
      await ctx.navigate(tabId, ctx.checkpoint.results_url)
      await ctx.ensureClear(tabId)
      const data = await ctx.dataOf(tabId)
      return extractCompanyList(data, ctx.detCfg.siteBaseHost).length > 0
    } catch {
      return false
    }
  }

  pause(): void {
    if (!this.running) return
    this.control.pauseRequested = true
    this.ctx?.activity('info', 'Pause requested - pausing after the current step')
  }

  async resume(): Promise<void> {
    if (this.running && this.ctx) {
      if (this.ctx.gate.pending()) {
        this.ctx.gate.requestResume()
        return
      }
      this.control.pauseRequested = false
      const waiters = this.control.resumeWaiters.splice(0)
      waiters.forEach((w) => w())
      return
    }
    if (!this.selectedTaskId) throw new Error('No task to resume')
    await this.start({ resumeTaskId: this.selectedTaskId })
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.control.stopRequested = true
    this.control.resumeWaiters.splice(0).forEach((w) => w())
    await this.running.catch(() => undefined)
  }

  async retry(): Promise<void> {
    if (this.running) return this.resume()
    if (!this.selectedTaskId) throw new Error('No task selected')
    const n = this.deps.repos.research.requeueFailed(this.selectedTaskId)
    this.deps.repos.tasks.addActivity(this.selectedTaskId, 'info', `Retry: ${n} failed companies re-queued`)
    await this.start({ resumeTaskId: this.selectedTaskId })
  }

  async exportNow(): Promise<string> {
    const taskId = this.selectedTaskId
    if (!taskId) throw new Error('No task selected')
    const task = this.deps.repos.tasks.get(taskId)!
    const settings = JSON.parse(task.settings_json) as AppSettings
    settings.output = this.currentSettings().output
    const res = await validateDedupExport(this.deps.repos, taskId, settings, this.deps.outputDir, (l, m) => {
      this.deps.onActivity(this.deps.repos.tasks.addActivity(taskId, l, m))
    })
    this.onStateChange()
    return res.path
  }

  dashboard(browserRunning: boolean, profileId: string | null): DashboardState {
    const repos = this.deps.repos
    const task = this.selectedTaskId ? repos.tasks.get(this.selectedTaskId) : undefined
    const emptyCounts = { companiesTotal: 0, companiesDone: 0, companiesFailed: 0, employees: 0, qualified: 0, tier1: 0, tier2: 0, tier3: 0, businessEmails: 0 }
    const human = this.ctx?.gate.pending() ?? null
    const last = task ? repos.tasks.lastExport(task.id) : undefined
    return {
      browser: browserRunning ? 'CONNECTED' : 'DISCONNECTED',
      profileId,
      google: this.auth.google,
      zoominfo: this.auth.zoominfo,
      controllerAi: this.ai.controller,
      researchAi: this.ai.research,
      task: task
        ? { id: task.id, name: task.name, status: task.status, stage: task.stage, created_at: task.created_at, updated_at: task.updated_at }
        : null,
      counts: task ? repos.research.counts(task.id) : emptyCounts,
      human,
      lastExportPath: last?.status === 'OK' ? last.path : null
    }
  }
}

function newCheckpoint(taskId: string, settings: AppSettings): Checkpoint {
  return {
    task_id: taskId,
    stage: 'INIT',
    company_index: 0,
    current_company_id: null,
    current_tab_id: null,
    current_url: '',
    search: { industry: settings.search.industry, naics: settings.search.naics },
    results_url: '',
    results_page: 1,
    human: null,
    updated_at: new Date().toISOString()
  }
}
