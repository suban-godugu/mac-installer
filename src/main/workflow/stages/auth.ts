import type { WorkflowContext } from '../context'
import { googleAuthenticated, siteAuthenticated } from '../../zoominfo/detectors'

const GOOGLE_PROBE_URL = 'https://myaccount.google.com/'

/** Confirms a signed-in Google session. The user signs in (and completes MFA) by hand. */
export async function googleAuthStage(ctx: WorkflowContext): Promise<void> {
  if (!ctx.settings.search.requireGoogleAuth) {
    ctx.activity('info', 'Google sign-in check skipped (disabled in settings)')
    return
  }
  const { tabId } = await ctx.deps.session.tabFor('auth')
  await ctx.navigate(tabId, GOOGLE_PROBE_URL)
  let obs = await ctx.observeTab(tabId)
  if (googleAuthenticated(obs.detection)) {
    ctx.deps.setAuth('google', 'AUTHENTICATED')
    ctx.activity('success', 'Google session active')
    return
  }
  ctx.deps.setAuth('google', 'NOT_AUTHENTICATED')
  const human = obs.detection.human ?? { reason: 'LOGIN_REQUIRED' as const, message: 'Please sign in to your Google account in the browser.' }
  await ctx.requireHuman(human.reason, human.message, tabId, async (userAsked) => {
    obs = await ctx.observeTab(tabId)
    if (googleAuthenticated(obs.detection)) return true
    if (userAsked && obs.detection.kind !== 'google_signin') {
      await ctx.navigate(tabId, GOOGLE_PROBE_URL)
      obs = await ctx.observeTab(tabId)
      return googleAuthenticated(obs.detection)
    }
    return false
  })
  ctx.deps.setAuth('google', 'AUTHENTICATED')
  ctx.activity('success', 'Google session active')
}

/** Opens ZoomInfo Sales in the search tab and waits for the user to log in if needed. */
export async function zoominfoAuthStage(ctx: WorkflowContext): Promise<string> {
  const { tabId } = await ctx.deps.session.tabFor('search')
  await ctx.navigate(tabId, ctx.settings.search.zoominfoStartUrl)
  const obs = await ctx.observeTab(tabId)
  if (siteAuthenticated(obs.detection)) {
    ctx.deps.setAuth('zoominfo', 'AUTHENTICATED')
    ctx.activity('success', 'ZoomInfo authenticated')
    return tabId
  }
  ctx.deps.setAuth('zoominfo', 'NOT_AUTHENTICATED')
  const human = obs.detection.human ?? { reason: 'LOGIN_REQUIRED' as const, message: 'Please log in to ZoomInfo Sales in the browser.' }
  await ctx.requireHuman(human.reason, human.message, tabId, async () => {
    const o = await ctx.observeTab(tabId)
    return siteAuthenticated(o.detection)
  })
  ctx.deps.setAuth('zoominfo', 'AUTHENTICATED')
  ctx.activity('success', 'ZoomInfo authenticated')
  return tabId
}
