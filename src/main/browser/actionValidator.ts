import { BrowserActionSchema, type BrowserAction } from '@shared/schemas'
import type { ObservedElement } from './pageScripts'

export interface ValidationContext {
  allowedDomains: string[]
  elements: ObservedElement[]
  tabIds: string[]
}

export type ValidationResult = { ok: true; action: BrowserAction } | { ok: false; reason: string }

const MAX_WAIT_MS = 10000
const TYPEABLE_TAGS = new Set(['input', 'textarea'])
const TYPEABLE_ROLES = new Set(['combobox', 'textbox', 'searchbox'])
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'submit', 'button', 'file', 'image', 'reset', 'hidden', 'password'])

export function isAllowedUrl(raw: string, allowedDomains: string[]): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return allowedDomains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))
}

/**
 * Policy gate between the controller model and the browser. Anything not explicitly
 * allowed is rejected; the controller receives the rejection reason as feedback.
 */
export function validateAction(input: unknown, ctx: ValidationContext): ValidationResult {
  const parsed = BrowserActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: `Malformed action: ${parsed.error.issues[0]?.message ?? 'invalid'}` }
  const action = parsed.data
  const element = (): ObservedElement | undefined => ctx.elements.find((e) => e.id === action.target)

  switch (action.action) {
    case 'navigate':
    case 'open_tab':
      if (!isAllowedUrl(action.target, ctx.allowedDomains)) {
        return { ok: false, reason: `URL not on allow-list: ${action.target || '(empty)'}` }
      }
      return { ok: true, action }

    case 'click': {
      const el = element()
      if (!el) return { ok: false, reason: `Element ${action.target} not in current observation` }
      if (el.disabled) return { ok: false, reason: `Element ${action.target} is disabled` }
      if (el.href && !el.href.startsWith('javascript:') && /^https?:/.test(el.href) && !isAllowedUrl(el.href, ctx.allowedDomains)) {
        return { ok: false, reason: `Link leads outside allow-list: ${el.href}` }
      }
      return { ok: true, action }
    }

    case 'type': {
      const el = element()
      if (!el) return { ok: false, reason: `Element ${action.target} not in current observation` }
      if (el.sensitive) return { ok: false, reason: 'Typing into password, verification-code or CAPTCHA fields is not allowed' }
      const typeable =
        (TYPEABLE_TAGS.has(el.tag) && !NON_TEXT_INPUT_TYPES.has(el.type)) ||
        TYPEABLE_ROLES.has(el.role) ||
        (el.role === '' && el.tag === 'div')
      if (!typeable) return { ok: false, reason: `Element ${action.target} is not a text field` }
      if (action.value === undefined || action.value.length === 0) return { ok: false, reason: 'type requires a value' }
      if (action.value.length > 200) return { ok: false, reason: 'Typed value too long' }
      return { ok: true, action }
    }

    case 'select': {
      const el = element()
      if (!el) return { ok: false, reason: `Element ${action.target} not in current observation` }
      if (!action.value) return { ok: false, reason: 'select requires a value' }
      if (el.tag === 'select' && el.options.length && !el.options.some((o) => o.toLowerCase() === action.value!.toLowerCase())) {
        return { ok: false, reason: `Option "${action.value}" not available` }
      }
      return { ok: true, action }
    }

    case 'scroll':
      if (action.target && !['up', 'down', 'page', 'top', 'bottom'].includes(action.target) && !element()) {
        return { ok: false, reason: `Scroll target ${action.target} not found` }
      }
      return { ok: true, action }

    case 'switch_tab':
    case 'close_tab': {
      const id = action.tab_id || action.target
      if (!ctx.tabIds.includes(id)) return { ok: false, reason: `Unknown tab ${id}` }
      return { ok: true, action: { ...action, tab_id: id } }
    }

    case 'wait': {
      const ms = Number(action.value ?? 1000)
      if (!Number.isFinite(ms) || ms < 0 || ms > MAX_WAIT_MS) return { ok: false, reason: `wait must be 0-${MAX_WAIT_MS} ms` }
      return { ok: true, action: { ...action, value: String(ms) } }
    }

    case 'extract':
    case 'pause_for_human':
    case 'resume':
    case 'complete':
    case 'error':
      return { ok: true, action }
  }
}
