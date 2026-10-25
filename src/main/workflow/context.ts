import type { Page } from 'playwright-core'
import type { AppSettings } from '@shared/config'
import type { Checkpoint, HumanReason, TabPurpose, TaskStage, TaskStatus } from '@shared/schemas'
import type { ActivityEvent, AuthState } from '@shared/ipc'
import type { Repos } from '../data/repositories'
import type { BrowserSessionManager } from '../browser/sessionManager'
import { BrowserCrashedError } from '../browser/sessionManager'
import type { ActionExecutor } from '../browser/actionExecutor'
import type { ControllerAgent } from '../agents/controllerAgent'
import type { ResearchAgent } from '../agents/researchAgent'
import { observe, observationForModel, pageData, type Observation } from '../browser/pageObserver'
import type { RawPageData } from '../browser/pageScripts'
import { isAllowedUrl, validateAction } from '../browser/actionValidator'
import type { DetectorConfig } from '../zoominfo/detectors'
import { baseHostOf } from '../zoominfo/detectors'
import { HumanGate } from './humanGate'
import { StepError, StopSignal, errMsg } from './retry'
import { sleep } from '../agents/openrouterClient'
import { log } from '../logger'

export interface Control {
  stopRequested: boolean
  pauseRequested: boolean
  resumeWaiters: (() => void)[]
}

export interface WorkflowDeps {
  repos: Repos
  session: BrowserSessionManager
  executor: ActionExecutor
  controller: ControllerAgent
  research: ResearchAgent
  outputDir: string
  onActivity: (e: ActivityEvent) => void
  onStateChange: () => void
  setAuth: (kind: 'google' | 'zoominfo', state: AuthState) => void
}

export interface GoalSpec {
  goal: string
  stage: TaskStage
  tabId: string
  purpose?: TabPurpose
  verify: (obs: Observation) => boolean | Promise<boolean>
  maxSteps?: number
}

/** Shared capabilities used by every workflow stage. */
export class WorkflowContext {
  readonly gate: HumanGate
  readonly detCfg: DetectorConfig
  readonly allowedDomains: string[]
  status: TaskStatus = 'RUNNING'

  constructor(
    readonly taskId: string,
    readonly settings: AppSettings,
    readonly deps: WorkflowDeps,
    readonly control: Control,
    public checkpoint: Checkpoint
  ) {
    this.gate = new HumanGate(() => this.control.stopRequested)
    const siteBase = baseHostOf(settings.search.zoominfoStartUrl) || 'zoominfo.com'
    this.detCfg = { siteBaseHost: siteBase }
    this.allowedDomains = [...new Set([...settings.runtime.allowedDomains, siteBase])]
  }

  get repos(): Repos {
    return this.deps.repos
  }

  activity(level: ActivityEvent['level'], message: string): void {
    const ev = this.deps.repos.tasks.addActivity(this.taskId, level, message)
    log().info({ task: this.taskId, level, message }, 'activity')
    this.deps.onActivity(ev)
  }

  recordError(kind: string, message: string, companyId: string | null = null): void {
    this.deps.repos.tasks.addError(this.taskId, this.checkpoint.stage, companyId, kind, message)
    log().error({ task: this.taskId, kind, message, companyId }, 'task error')
  }

  setStatus(status: TaskStatus): void {
    this.status = status
    this.deps.repos.tasks.setStatus(this.taskId, status)
    this.deps.onStateChange()
  }

  saveCheckpoint(patch: Partial<Checkpoint> = {}): void {
    Object.assign(this.checkpoint, patch)
    const active = this.deps.session.tabs.active()
    this.checkpoint.current_tab_id = active?.record.tab_id ?? null
    this.checkpoint.current_url = active?.record.url ?? ''
    this.deps.repos.tasks.saveCheckpoint(this.checkpoint)
    this.deps.repos.tasks.saveTabs(this.taskId, this.deps.session.tabs.list())
    this.deps.onStateChange()
  }

  enterStage(stage: TaskStage): void {
    this.checkpoint.stage = stage
    this.deps.repos.tasks.setStage(this.taskId, stage)
    this.saveCheckpoint()
  }

  /** Cooperative pause/stop point. Called between every unit of work. */
  async checkControl(): Promise<void> {
    if (this.control.stopRequested) throw new StopSignal()
    if (!this.control.pauseRequested) return
    this.saveCheckpoint()
    this.setStatus('PAUSED')
    this.activity('info', 'Task paused')
    await new Promise<void>((resolve) => this.control.resumeWaiters.push(resolve))
    if (this.control.stopRequested) throw new StopSignal()
    this.setStatus('RUNNING')
    this.activity('info', 'Task resumed')
  }

  page(tabId: string): Page {
    if (!this.deps.session.isRunning()) throw new BrowserCrashedError('Browser is not running')
    const entry = this.deps.session.tabs.get(tabId)
    if (!entry || entry.page.isClosed()) throw new StepError(`Tab ${tabId} is no longer open`, 'TAB_LOST')
    return entry.page
  }

  async observeTab(tabId: string): Promise<Observation> {
    return observe(this.page(tabId), tabId, this.detCfg)
  }

  async dataOf(tabId: string): Promise<RawPageData> {
    return pageData(this.page(tabId))
  }

  async navigate(tabId: string, url: string): Promise<void> {
    const res = validateAction({ action: 'navigate', target: url, reason: 'workflow' }, {
      allowedDomains: this.allowedDomains,
      elements: [],
      tabIds: []
    })
    if (!res.ok) throw new StepError(res.reason, 'NAVIGATION_BLOCKED')
    const out = await this.deps.executor.execute(res.action, tabId)
    if (!out.ok) throw new StepError(out.message, 'NAVIGATION_FAILED')
  }

  /** Pauses for the human until `verify` confirms the issue is gone. Checkpoint is saved first. */
  async requireHuman(
    reason: HumanReason,
    message: string,
    tabId: string | null,
    verify: (userAsked: boolean) => Promise<boolean>
  ): Promise<void> {
    this.saveCheckpoint({ human: { reason, message } })
    this.setStatus('HUMAN_ACTION_REQUIRED')
    this.activity('warn', `Human action required: ${message}`)
    if (tabId) await this.deps.session.bringToFront(tabId)
    await this.gate.wait({ reason, message }, verify, () => this.activity('warn', 'Still waiting - the issue is not resolved yet in the browser'))
    this.saveCheckpoint({ human: null })
    this.setStatus('RUNNING')
    this.activity('success', 'Human action completed, continuing')
  }

  /** If the page currently shows login/MFA/CAPTCHA/permission screens, wait for the human. */
  async ensureClear(tabId: string, obs?: Observation): Promise<Observation> {
    let current = obs ?? (await this.observeTab(tabId))
    if (current.url && current.url !== 'about:blank' && !isAllowedUrl(current.url, this.allowedDomains) && !current.detection.human) {
      current.detection.human = { reason: 'UNEXPECTED_PAGE', message: `The browser is on an unexpected page (${new URL(current.url).hostname}). Please return to the research site.` }
    }
    const human = current.detection.human
    if (!human) return current
    if (human.reason === 'LOGIN_REQUIRED' || human.reason === 'LOGIN_EXPIRED' || human.reason === 'MFA') {
      this.deps.setAuth(current.detection.kind.startsWith('google') ? 'google' : 'zoominfo', 'NOT_AUTHENTICATED')
    }
    await this.requireHuman(human.reason, human.message, tabId, async () => {
      current = await this.observeTab(tabId)
      return !current.detection.human && (isAllowedUrl(current.url, this.allowedDomains) || current.url === 'about:blank')
    })
    if (current.detection.kind.startsWith('zoominfo')) this.deps.setAuth('zoominfo', 'AUTHENTICATED')
    return current
  }

  /**
   * Observe -> Controller AI -> Validator -> Executor loop until `verify` passes on a fresh
   * observation. Bounded by maxSteps; the model's own "complete" claim is never trusted alone.
   */
  async runGoal(spec: GoalSpec): Promise<{ tabId: string; obs: Observation }> {
    let tabId = spec.tabId
    const maxSteps = spec.maxSteps ?? this.settings.runtime.maxControllerSteps
    const history: { action: unknown; outcome: string }[] = []
    let feedback: string | undefined
    let consecutiveFailures = 0

    for (let step = 0; step < maxSteps; step++) {
      await this.checkControl()
      const obs = await this.ensureClear(tabId)
      if (await spec.verify(obs)) return { tabId, obs }

      const tabs = this.deps.session.tabs.list().map((t) => ({ tab_id: t.tab_id, purpose: t.purpose, company_id: t.company_id }))
      const raw = await this.deps.controller.nextAction({
        goal: spec.goal,
        stage: spec.stage,
        observation: observationForModel(obs, tabs),
        history,
        feedback
      })
      feedback = undefined
      const v = validateAction(raw, {
        allowedDomains: this.allowedDomains,
        elements: obs.elements,
        tabIds: tabs.map((t) => t.tab_id)
      })
      if (!v.ok) {
        history.push({ action: raw, outcome: `REJECTED: ${v.reason}` })
        feedback = `Your last action was rejected: ${v.reason}`
        log().warn({ task: this.taskId, reason: v.reason }, 'action rejected')
        if (++consecutiveFailures >= 4) await this.ambiguous(tabId, spec.goal)
        continue
      }
      const action = v.action
      switch (action.action) {
        case 'complete':
          history.push({ action, outcome: 'Goal not yet verified by the application on this page' })
          feedback = 'The application could not verify the goal on the current page. Continue working toward it.'
          if (++consecutiveFailures >= 4) await this.ambiguous(tabId, spec.goal)
          continue
        case 'pause_for_human':
          await this.requireHuman(
            'AMBIGUOUS_STATE',
            action.reason || 'The controller needs your help in the browser.',
            tabId,
            async (userAsked) => userAsked
          )
          history.push({ action, outcome: 'Human resumed' })
          continue
        case 'error':
          throw new StepError(`Controller could not reach goal: ${action.reason}`, 'CONTROLLER_ERROR')
        case 'extract':
        case 'resume':
          history.push({ action, outcome: 'Not needed: extraction is performed by the application' })
          continue
        default: {
          const out = await this.deps.executor.execute(action, tabId, spec.purpose)
          history.push({ action, outcome: out.ok ? out.message : `FAILED: ${out.message}` })
          if (out.ok) {
            consecutiveFailures = 0
            if (out.tabId) tabId = out.tabId
          } else {
            feedback = `Action failed: ${out.message}`
            if (++consecutiveFailures >= 4) await this.ambiguous(tabId, spec.goal)
            await sleep(500)
          }
        }
      }
    }
    throw new StepError(`Could not complete "${spec.goal}" within ${maxSteps} steps`, 'MAX_STEPS')
  }

  private async ambiguous(tabId: string, goal: string): Promise<void> {
    await this.requireHuman(
      'AMBIGUOUS_STATE',
      `The agent is stuck while trying to: ${goal}. Please bring the page to the right state, then press Resume.`,
      tabId,
      async (userAsked) => userAsked
    )
  }

  describeError(err: unknown): string {
    return errMsg(err)
  }
}
