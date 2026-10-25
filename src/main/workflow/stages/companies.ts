import { NOT_AVAILABLE } from '@shared/config'
import type { CompanyRecord } from '@shared/schemas'
import type { WorkflowContext } from '../context'
import type { NewCompany, NewEmployee } from '../../data/repositories/research'
import {
  enforceVerbatim,
  extractCompanyProfile,
  extractPeopleFromTables,
  extractTechnologies
} from '../../zoominfo/extractors'
import { pageData } from '../../browser/pageObserver'
import { BrowserCrashedError } from '../../browser/sessionManager'
import { StopSignal, StepError, errMsg } from '../retry'
import { sleep } from '../../agents/openrouterClient'

const NA = NOT_AVAILABLE

function mergeKnown(current: CompanyRecord, found: Partial<NewCompany>): Partial<NewCompany> {
  const patch: Partial<NewCompany> = {}
  for (const [k, v] of Object.entries(found) as [keyof NewCompany, string][]) {
    if (v && v !== NA && (current[k] === NA || !current[k])) patch[k] = v
  }
  return patch
}

/** Processes every queued company with bounded retries; failures never stop the whole task. */
export async function processCompaniesStage(ctx: WorkflowContext): Promise<void> {
  const { retryAttempts, retryBaseDelayMs } = ctx.settings.runtime
  const companies = ctx.repos.research.companies(ctx.taskId)
  const total = companies.length

  for (const company of companies) {
    if (company.status === 'COMPLETED' || company.status === 'FAILED') continue
    await ctx.checkControl()
    ctx.saveCheckpoint({ company_index: company.idx, current_company_id: company.id })
    ctx.activity('progress', `Processing company ${company.idx + 1}/${total}: ${company.name}`)

    for (;;) {
      try {
        await processOneCompany(ctx, company.id)
        break
      } catch (err) {
        if (err instanceof StopSignal) throw err
        const attempts = ctx.repos.research.incrementAttempts(company.id)
        ctx.recordError(err instanceof StepError ? err.kind : 'COMPANY_FAILED', errMsg(err), company.id)
        if (err instanceof BrowserCrashedError) await recoverBrowser(ctx)
        if (attempts >= retryAttempts) {
          ctx.repos.research.setCompanyStatus(company.id, 'FAILED', errMsg(err))
          ctx.activity('error', `Company ${company.name} failed after ${attempts} attempts: ${errMsg(err)}`)
          break
        }
        ctx.activity('warn', `Retrying ${company.name} (attempt ${attempts + 1}/${retryAttempts}): ${errMsg(err)}`)
        await sleep(retryBaseDelayMs * 2 ** (attempts - 1))
      }
    }
    await closeCompanyTabs(ctx, company.id)
    ctx.saveCheckpoint()
  }
}

async function recoverBrowser(ctx: WorkflowContext): Promise<void> {
  const profileId = ctx.deps.session.currentProfileId() ?? ctx.repos.tasks.get(ctx.taskId)?.profile_id
  if (ctx.deps.session.isRunning() || !profileId) return
  ctx.activity('warn', 'Browser closed unexpectedly - restarting the saved profile')
  await ctx.deps.session.start(profileId)
}

async function closeCompanyTabs(ctx: WorkflowContext, companyId: string): Promise<void> {
  for (const t of ctx.deps.session.tabs.list()) {
    if (t.company_id === companyId) await ctx.deps.session.closeTab(t.tab_id)
  }
}

async function processOneCompany(ctx: WorkflowContext, companyId: string): Promise<void> {
  const repo = ctx.repos.research
  let company = repo.company(companyId)!
  const site = ctx.detCfg.siteBaseHost
  repo.setCompanyStatus(company.id, 'PROCESSING')

  const { tabId } = await ctx.deps.session.tabFor('company', company.id)
  await ctx.navigate(tabId, company.profile_url)
  await ctx.ensureClear(tabId)

  // Company information (overview / organization)
  const overview = await ctx.dataOf(tabId)
  repo.updateCompany(company.id, mergeKnown(company, extractCompanyProfile(overview, site)))
  company = repo.company(companyId)!

  await visitOptionalSection(ctx, tabId, company, 'organization', async (data) => {
    repo.updateCompany(company.id, mergeKnown(company, extractCompanyProfile(data, site)))
  })
  company = repo.company(companyId)!

  await visitOptionalSection(ctx, tabId, company, 'technology', async (data) => {
    const tech = extractTechnologies(data)
    if (tech !== NA) repo.updateCompany(company.id, { technology: tech })
  })
  company = repo.company(companyId)!
  ctx.saveCheckpoint()

  // People / employees
  const people = await collectPeople(ctx, tabId, company)
  const stored = repo.replaceEmployees(ctx.taskId, company.id, people)
  repo.setCompanyStatus(company.id, 'EMPLOYEES_FOUND')
  ctx.activity('progress', `${company.name}: ${stored.length} employees collected`)
  ctx.saveCheckpoint()

  // Qualification by Research AI
  if (stored.length) {
    await ctx.checkControl()
    ctx.activity('progress', `Employee qualification running for ${company.name}`)
    const s = ctx.settings
    const evals = await ctx.deps.research.evaluate(company, stored, s.roles, s.scoring, s.runtime.researchBatchSize)
    repo.saveEvaluations(evals)
    const relevant = evals.filter((e) => e.relevant)
    const t1 = relevant.filter((e) => e.priority === 'Tier 1').length
    ctx.activity('success', `${company.name}: ${relevant.length}/${stored.length} relevant (${t1} Tier 1)`)
  }
  repo.setCompanyStatus(company.id, 'QUALIFIED')
  repo.setCompanyStatus(company.id, 'COMPLETED')
  ctx.activity('success', `Company ${company.idx + 1} processed: ${company.name}`)
}

const SECTION_GOALS: Record<'organization' | 'technology', { goal: string; test: RegExp }> = {
  organization: {
    goal: 'On this company profile, open the Organization / Org Chart / company details section.',
    test: /(org chart|organization|org\.? structure)/i
  },
  technology: {
    goal: 'On this company profile, open the Technology / Tech Stack / Technologies section.',
    test: /(technolog|tech stack|installed)/i
  }
}

/** Non-fatal: a missing section just leaves the related fields NOT_AVAILABLE. */
async function visitOptionalSection(
  ctx: WorkflowContext,
  tabId: string,
  company: CompanyRecord,
  section: 'organization' | 'technology',
  onData: (data: Awaited<ReturnType<typeof pageData>>) => Promise<void>
): Promise<void> {
  const spec = SECTION_GOALS[section]
  try {
    const startUrl = ctx.page(tabId).url()
    const res = await ctx.runGoal({
      goal: `${spec.goal} Company: ${company.name}. If this section does not exist, respond with action "error".`,
      stage: 'PROCESS_COMPANIES',
      tabId,
      purpose: section,
      maxSteps: 6,
      verify: (obs) =>
        obs.url !== startUrl && spec.test.test(obs.headings.join(' ') + ' ' + obs.url) && obs.detection.kind !== 'zoominfo_login'
    })
    await onData(await pageData(ctx.page(res.tabId)))
    ctx.activity('info', `${company.name}: ${section} inspected`)
  } catch (err) {
    if (err instanceof StopSignal || err instanceof BrowserCrashedError) throw err
    ctx.activity('info', `${company.name}: ${section} section not available (${errMsg(err)})`)
  }
}

async function collectPeople(ctx: WorkflowContext, startTabId: string, company: CompanyRecord): Promise<NewEmployee[]> {
  const max = Math.max(1, ctx.settings.search.maxEmployeesPerCompany)
  const peopleOn = async (tabId: string): Promise<NewEmployee[]> => {
    const data = await pageData(ctx.page(tabId))
    const now = new Date().toISOString()
    const fromTables = extractPeopleFromTables(data, now)
    if (fromTables.length) return fromTables
    if (!/(employees|contacts|people)/i.test(data.text)) return []
    const structured = await ctx.deps.controller.structurePeople(data.text)
    return enforceVerbatim(structured, data.text, data.url, now)
  }

  const { tabId } = await ctx.runGoal({
    goal: `Open the list of employees / contacts (People) who work at ${company.name} on this company profile.`,
    stage: 'PROCESS_COMPANIES',
    tabId: startTabId,
    purpose: 'employees',
    verify: async (obs) => {
      if (obs.detection.kind !== 'zoominfo_people' && !/(contacts|employees|people)/i.test(obs.headings.join(' '))) return false
      const data = await pageData(ctx.page(obs.tab_id))
      return extractPeopleFromTables(data, '').length > 0 || obs.detection.kind === 'zoominfo_people'
    }
  })
  ctx.activity('info', `${company.name}: people list opened`)

  const all: NewEmployee[] = []
  const seen = new Set<string>()
  for (let pageNo = 1; pageNo <= 20 && all.length < max; pageNo++) {
    await ctx.checkControl()
    await ctx.ensureClear(tabId)
    const batch = await peopleOn(tabId)
    let added = 0
    for (const p of batch) {
      const key = `${p.name.toLowerCase()}|${p.role.toLowerCase()}`
      if (seen.has(key) || all.length >= max) continue
      seen.add(key)
      all.push(p)
      added++
    }
    if (!added || all.length >= max) break
    const firstName = batch[0]?.name
    try {
      await ctx.runGoal({
        goal: 'Go to the NEXT page of this employee/contact list. If there is no next page, respond with action "error".',
        stage: 'PROCESS_COMPANIES',
        tabId,
        purpose: 'employees',
        maxSteps: 5,
        verify: async (obs) => {
          const d = await pageData(ctx.page(obs.tab_id))
          const rows = extractPeopleFromTables(d, '')
          return rows.length > 0 && rows[0].name !== firstName
        }
      })
    } catch (err) {
      if (err instanceof StopSignal || err instanceof BrowserCrashedError) throw err
      break
    }
  }
  return all
}
