import { describe, expect, it } from 'vitest'
import { validateAction, isAllowedUrl } from '../src/main/browser/actionValidator'
import type { ObservedElement } from '../src/main/browser/pageScripts'

const el = (id: string, over: Partial<ObservedElement> = {}): ObservedElement => ({
  id,
  tag: 'button',
  role: '',
  type: '',
  name: id,
  href: '',
  checked: null,
  disabled: false,
  sensitive: false,
  hasValue: false,
  options: [],
  ...over
})

const ctx = {
  allowedDomains: ['zoominfo.com', 'google.com'],
  elements: [
    el('e1'),
    el('e2', { tag: 'input', type: 'text', name: 'NAICS' }),
    el('e3', { tag: 'input', type: 'password', sensitive: true }),
    el('e4', { tag: 'a', href: 'https://evil.example.net/x' }),
    el('e5', { tag: 'select', options: ['Manufacturing', 'Technology'] }),
    el('e6', { disabled: true }),
    el('e7', { tag: 'input', type: 'text', name: 'Verification code', sensitive: true })
  ],
  tabIds: ['tab_001', 'tab_002']
}

describe('ActionValidator', () => {
  it('rejects malformed and unknown actions', () => {
    expect(validateAction({ action: 'execute_js', target: 'x' }, ctx).ok).toBe(false)
    expect(validateAction('click e1', ctx).ok).toBe(false)
  })

  it('enforces the domain allow-list for navigation', () => {
    expect(validateAction({ action: 'navigate', target: 'https://app.zoominfo.com/#/search' }, ctx).ok).toBe(true)
    expect(validateAction({ action: 'navigate', target: 'https://zoominfo.com.evil.io/' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'navigate', target: 'file:///C:/Windows' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'open_tab', target: 'javascript:alert(1)' }, ctx).ok).toBe(false)
    expect(isAllowedUrl('https://user:pw@app.zoominfo.com/', ctx.allowedDomains)).toBe(false)
  })

  it('requires click targets from the current observation', () => {
    expect(validateAction({ action: 'click', target: 'e1' }, ctx).ok).toBe(true)
    expect(validateAction({ action: 'click', target: 'e99' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'click', target: 'e6' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'click', target: 'e4' }, ctx).ok).toBe(false)
  })

  it('never allows typing into password / verification / captcha fields', () => {
    expect(validateAction({ action: 'type', target: 'e3', value: 'secret' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'type', target: 'e7', value: '123456' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'type', target: 'e2', value: '334413' }, ctx).ok).toBe(true)
    expect(validateAction({ action: 'type', target: 'e1', value: 'x' }, ctx).ok).toBe(false)
  })

  it('validates select options, tabs and waits', () => {
    expect(validateAction({ action: 'select', target: 'e5', value: 'technology' }, ctx).ok).toBe(true)
    expect(validateAction({ action: 'select', target: 'e5', value: 'Retail' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'switch_tab', tab_id: 'tab_002' }, ctx).ok).toBe(true)
    expect(validateAction({ action: 'close_tab', target: 'tab_009' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'wait', value: '20000' }, ctx).ok).toBe(false)
    expect(validateAction({ action: 'wait', value: '1500' }, ctx).ok).toBe(true)
  })

  it('passes control actions through', () => {
    for (const a of ['complete', 'pause_for_human', 'error', 'extract', 'resume']) {
      expect(validateAction({ action: a, reason: 'x' }, ctx).ok).toBe(true)
    }
  })
})
