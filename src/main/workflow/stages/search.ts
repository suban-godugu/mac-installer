import type { WorkflowContext } from '../context'
import { extractCompanyList } from '../../zoominfo/extractors'
import { pageData } from '../../browser/pageObserver'
import { StopSignal } from '../retry'

const includesAll = (text: string, needles: string[]): boolean => {
  const t = text.toLowerCase()
  return needles.every((n) => t.includes(n.toLowerCase()))
}

export async function openAdvancedSearchStage(ctx: WorkflowContext, tabId: string): Promise<string> {
  const res = await ctx.runGoal({
    goal: 'Open the Advanced Search for COMPANIES in ZoomInfo Sales (the company search screen with filters such as Industry and NAICS).',
    stage: 'OPEN_ADVANCED_SEARCH',
    tabId,
    purpose: 'search',
    verify: (obs) =>
      (obs.detection.kind === 'zoominfo_search' || obs.detection.kind === 'zoominfo_results') &&
      /industr/i.test(obs.raw.text) &&
      /naics|industry code/i.test(obs.raw.text)
  })
  ctx.activity('success', 'Advanced Search opened')
  return res.tabId
}

export async function applyFiltersStage(ctx: WorkflowContext, tabId: string): Promise<string> {
  const { industry, naics } = ctx.settings.search
  const res = await ctx.runGoal({
    goal:
      `In the company Advanced Search, set the filters: Industry = ${industry.map((i) => `"${i}"`).join(' and ')}; ` +
      `NAICS code = ${naics.join(', ')}. Use the Industry filter and the NAICS / industry-code filter (search by code). ` +
      'Do not run any other filters. When the filters show as applied/selected, stop.',
    stage: 'APPLY_FILTERS',
    tabId,
    purpose: 'search',
    verify: (obs) => includesAll(obs.raw.text, naics) && includesAll(obs.raw.text, industry)
  })
  ctx.activity('success', `Filters applied: ${industry.join(', ')}; NAICS ${naics.join(', ')}`)
  return res.tabId
}

export async function runSearchStage(ctx: WorkflowContext, tabId: string): Promise<string> {
  const site = ctx.detCfg.siteBaseHost
  const res = await ctx.runGoal({
    goal: 'Run the company search with the applied filters and show the list of company results.',
    stage: 'RUN_SEARCH',
    tabId,
    purpose: 'search',
    verify: async (obs) => {
      if (!/compan|result/i.test(obs.raw.text)) return false
      const data = await pageData(ctx.page(obs.tab_id))
      return extractCompanyList(data, site).length > 0
    }
  })
  const countMatch = /([\d,]+)\s+(results|companies)/i.exec(res.obs.raw.text)
  ctx.activity('success', `Search completed${countMatch ? ` - ${countMatch[1]} results reported` : ''}`)
  ctx.saveCheckpoint({ results_url: res.obs.url, results_page: 1 })
  return res.tabId
}

/** Reads company rows page by page until maxCompanies is reached or there are no more pages. */
export async function collectCompaniesStage(ctx: WorkflowContext, tabId: string): Promise<void> {
  const site = ctx.detCfg.siteBaseHost
  const max = Math.max(1, ctx.settings.search.maxCompanies)
  let page = ctx.checkpoint.results_page || 1

  for (;;) {
    await ctx.checkControl()
    await ctx.ensureClear(tabId)
    const data = await ctx.dataOf(tabId)
    const found = extractCompanyList(data, site)
    const have = ctx.repos.research.companyCount(ctx.taskId)
    const added = ctx.repos.research.addCompanies(ctx.taskId, found.slice(0, Math.max(0, max - have)))
    const total = ctx.repos.research.companyCount(ctx.taskId)
    ctx.activity('progress', `Results page ${page}: ${found.length} companies read, ${added} new (total ${total}/${max})`)
    ctx.saveCheckpoint({ results_page: page, results_url: data.url })
    if (total >= max || found.length === 0) break

    const firstBefore = found[0]?.profile_url
    try {
      await ctx.runGoal({
        goal: 'Go to the NEXT page of the company results list. If there is no next page, respond with action "error".',
        stage: 'COLLECT_COMPANIES',
        tabId,
        purpose: 'search',
        maxSteps: 6,
        verify: async (obs) => {
          const d = await pageData(ctx.page(obs.tab_id))
          const list = extractCompanyList(d, site)
          return list.length > 0 && list[0].profile_url !== firstBefore
        }
      })
      page++
    } catch (err) {
      if (err instanceof StopSignal) throw err
      ctx.activity('info', `No further result pages (${ctx.describeError(err)})`)
      break
    }
  }
  ctx.activity('success', `Company collection finished: ${ctx.repos.research.companyCount(ctx.taskId)} companies queued`)
}
