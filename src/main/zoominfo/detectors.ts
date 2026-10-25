import type { HumanReason } from '@shared/schemas'
import type { RawSnapshot } from '../browser/pageScripts'

export type PageKind =
  | 'blank'
  | 'google_signin'
  | 'google_account'
  | 'zoominfo_login'
  | 'zoominfo_app'
  | 'zoominfo_search'
  | 'zoominfo_results'
  | 'zoominfo_company'
  | 'zoominfo_people'
  | 'other'

export interface Detection {
  kind: PageKind
  human: { reason: HumanReason; message: string } | null
}

export interface DetectorConfig {
  /** Base host of the research site, e.g. "zoominfo.com" (or "localhost" in fixture mode). */
  siteBaseHost: string
}

const CAPTCHA_FRAME = /(recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha)/i
const CAPTCHA_TEXT = /(i'?m not a robot|verify (that )?you are (a )?human|unusual traffic|complete the security check|press (and|&) hold)/i
const MFA_TEXT = /(2-step verification|two-step verification|two-factor|verification code|enter the code|authenticator app|one-time (pass)?code|verify it'?s you|check your phone|security key)/i
const EXPIRED_TEXT = /(session (has )?expired|you have been (signed|logged) out|please (sign|log) in again|session timed out)/i
const PERMISSION_TEXT = /(access denied|not authori[sz]ed|you don'?t have (access|permission)|insufficient credits|upgrade your (plan|subscription|account)|usage limit (reached|exceeded)|rate limit)/i

export function baseHostOf(url: string): string {
  try {
    const host = new URL(url).hostname
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return host
    const parts = host.split('.')
    return parts.length <= 2 ? host : parts.slice(-2).join('.')
  } catch {
    return ''
  }
}

function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`)
}

export function detectPage(snap: Pick<RawSnapshot, 'url' | 'title' | 'text' | 'iframes' | 'hasPasswordField' | 'hasOtpField'>, cfg: DetectorConfig): Detection {
  let url: URL | null = null
  try {
    url = new URL(snap.url)
  } catch {
    url = null
  }
  if (!url || snap.url === 'about:blank') return { kind: 'blank', human: null }

  const host = url.hostname
  const pathAndHash = `${url.pathname}${url.hash}`.toLowerCase()
  const text = snap.text.slice(0, 8000)

  if (snap.iframes.some((src) => CAPTCHA_FRAME.test(src)) || CAPTCHA_TEXT.test(text)) {
    return { kind: classify(host, pathAndHash, cfg, snap), human: { reason: 'CAPTCHA', message: 'A CAPTCHA / human verification is shown. Please complete it in the browser.' } }
  }

  if (hostMatches(host, 'accounts.google.com')) {
    const challenge = pathAndHash.includes('challenge') || snap.hasOtpField || MFA_TEXT.test(text)
    return {
      kind: 'google_signin',
      human: challenge
        ? { reason: 'MFA', message: 'Google is asking for 2-step verification. Please complete it in the browser.' }
        : { reason: 'LOGIN_REQUIRED', message: 'Please sign in to your Google account in the browser.' }
    }
  }
  if (hostMatches(host, 'myaccount.google.com')) return { kind: 'google_account', human: null }

  const onSite = hostMatches(host, cfg.siteBaseHost)
  if (onSite || /okta|auth0|sso/i.test(host)) {
    if (snap.hasOtpField || (MFA_TEXT.test(text) && !snap.hasPasswordField && isLoginPath(pathAndHash))) {
      return { kind: 'zoominfo_login', human: { reason: 'MFA', message: 'ZoomInfo is asking for multi-factor verification. Please complete it in the browser.' } }
    }
    if (EXPIRED_TEXT.test(text)) {
      return { kind: 'zoominfo_login', human: { reason: 'LOGIN_EXPIRED', message: 'Your ZoomInfo session expired. Please log in again in the browser.' } }
    }
    if (snap.hasPasswordField || isLoginPath(pathAndHash) || !onSite) {
      return { kind: 'zoominfo_login', human: { reason: 'LOGIN_REQUIRED', message: 'Please log in to ZoomInfo Sales in the browser.' } }
    }
    if (PERMISSION_TEXT.test(text)) {
      return { kind: classify(host, pathAndHash, cfg, snap), human: { reason: 'PERMISSION_ISSUE', message: 'ZoomInfo reports a permission, credit or usage-limit issue. Please review it in the browser.' } }
    }
    return { kind: classify(host, pathAndHash, cfg, snap), human: null }
  }

  if (snap.hasPasswordField) {
    return { kind: 'other', human: { reason: 'UNEXPECTED_AUTHENTICATION', message: `An unexpected login page appeared (${host}). Please review it in the browser.` } }
  }
  return { kind: 'other', human: null }
}

function isLoginPath(p: string): boolean {
  return /(^|\/|#)(login|signin|sign-in|sso|auth)(\b|\/|\?|$)/.test(p)
}

function classify(host: string, p: string, cfg: DetectorConfig, snap: Pick<RawSnapshot, 'text'>): PageKind {
  if (!hostMatches(host, cfg.siteBaseHost)) return 'other'
  if (/\/company\/[\w-]+\/(employees|people|contacts)/.test(p)) return 'zoominfo_people'
  if (/\/company\/[\w-]+/.test(p)) return 'zoominfo_company'
  if (/search/.test(p)) {
    return /\b\d[\d,]*\s+(results|companies)\b/i.test(snap.text) ? 'zoominfo_results' : 'zoominfo_search'
  }
  return 'zoominfo_app'
}

/** Google authentication state derived from a myaccount.google.com probe. */
export function googleAuthenticated(det: Detection): boolean {
  return det.kind === 'google_account' && det.human === null
}

export function siteAuthenticated(det: Detection): boolean {
  return det.kind.startsWith('zoominfo_') && det.kind !== 'zoominfo_login' && det.human === null
}
