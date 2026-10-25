/*
 * Scripts evaluated inside the browser page. Kept as plain JS strings so bundler
 * helpers never leak into the page context.
 */

export interface ObservedElement {
  id: string
  tag: string
  role: string
  type: string
  name: string
  href: string
  checked: boolean | null
  disabled: boolean
  sensitive: boolean
  hasValue: boolean
  options: string[]
}

export interface RawSnapshot {
  url: string
  title: string
  text: string
  headings: string[]
  iframes: string[]
  hasPasswordField: boolean
  hasOtpField: boolean
  elements: ObservedElement[]
}

export const OBSERVE_SCRIPT = String.raw`(() => {
  const MAX_ELEMENTS = 250;
  const SENSITIVE = /(pass(word|code)?|otp|one.?time|mfa|2fa|totp|verification.?code|security.?code|captcha|\bpin\b|sms.?code)/i;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const labelFor = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
      if (t.trim()) return t;
    }
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return l.innerText;
    }
    const wrap = el.closest('label');
    if (wrap) return wrap.innerText;
    return el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || el.value && el.tagName === 'BUTTON' && el.value || '';
  };
  const isSensitive = (el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password') return true;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (ac.includes('one-time-code') || ac.includes('password')) return true;
    const sig = [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' ');
    return (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && SENSITIVE.test(sig);
  };

  document.querySelectorAll('[data-vpib-id]').forEach((el) => el.removeAttribute('data-vpib-id'));
  const selector = 'a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=option], [role=tab], [role=menuitem], [role=combobox], [role=switch], [role=treeitem], [contenteditable=true]';
  const nodes = Array.from(document.querySelectorAll(selector));
  const elements = [];
  let hasPasswordField = false;
  let hasOtpField = false;
  let n = 0;
  for (const el of nodes) {
    if (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'hidden') continue;
    const sensitive = isSensitive(el);
    const isVisible = visible(el);
    if (sensitive && isVisible) {
      if ((el.getAttribute('type') || '').toLowerCase() === 'password') hasPasswordField = true;
      else hasOtpField = true;
    }
    if (!isVisible || elements.length >= MAX_ELEMENTS) continue;
    const id = 'e' + (++n);
    el.setAttribute('data-vpib-id', id);
    const checked = el.getAttribute('aria-checked') ?? el.getAttribute('aria-selected');
    elements.push({
      id,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: clean(labelFor(el)),
      href: el.tagName === 'A' ? (el.href || '').slice(0, 300) : '',
      checked: el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio') ? el.checked : (checked == null ? null : checked === 'true'),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      sensitive,
      hasValue: 'value' in el && !!el.value,
      options: el.tagName === 'SELECT' ? Array.from(el.options).slice(0, 30).map((o) => clean(o.text)) : []
    });
  }
  const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => f.src || '').filter(Boolean).slice(0, 30);
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role=heading]')).filter(visible).map((h) => clean(h.innerText)).filter(Boolean).slice(0, 30);
  return {
    url: location.href,
    title: document.title,
    text: (document.body ? document.body.innerText : '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').slice(0, 20000),
    headings,
    iframes,
    hasPasswordField,
    hasOtpField,
    elements
  };
})()`

export interface RawTable {
  headers: string[]
  rows: { cells: string[]; links: { text: string; href: string }[]; mailtos: string[] }[]
}

export interface RawPageData {
  url: string
  text: string
  tables: RawTable[]
  labelValues: { label: string; value: string }[]
  links: { text: string; href: string }[]
  mailtos: string[]
}

/** Collects tables (native and ARIA grids), label/value pairs and links for deterministic extraction. */
export const EXTRACT_SCRIPT = String.raw`(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const linksIn = (root) => Array.from(root.querySelectorAll('a[href]')).map((a) => ({ text: clean(a.innerText).slice(0, 200), href: a.href })).slice(0, 20);
  const mailtosIn = (root) => Array.from(root.querySelectorAll('a[href^="mailto:"]')).map((a) => a.getAttribute('href').slice(7).split('?')[0]);
  const tables = [];
  for (const t of Array.from(document.querySelectorAll('table'))) {
    const headerCells = t.querySelectorAll('thead th, thead td');
    let headers = Array.from(headerCells).map((c) => clean(c.innerText));
    let bodyRows = Array.from(t.querySelectorAll('tbody tr'));
    if (!headers.length) {
      const first = t.querySelector('tr');
      if (first) {
        headers = Array.from(first.querySelectorAll('th, td')).map((c) => clean(c.innerText));
        bodyRows = Array.from(t.querySelectorAll('tr')).slice(1);
      }
    }
    tables.push({
      headers,
      rows: bodyRows.slice(0, 500).map((r) => ({
        cells: Array.from(r.querySelectorAll('td, th')).map((c) => clean(c.innerText).slice(0, 300)),
        links: linksIn(r),
        mailtos: mailtosIn(r)
      }))
    });
  }
  for (const g of Array.from(document.querySelectorAll('[role=grid], [role=table], [role=treegrid]'))) {
    if (g.tagName === 'TABLE') continue;
    const headers = Array.from(g.querySelectorAll('[role=columnheader]')).map((c) => clean(c.innerText));
    const rows = Array.from(g.querySelectorAll('[role=row]')).filter((r) => r.querySelector('[role=cell], [role=gridcell]'));
    tables.push({
      headers,
      rows: rows.slice(0, 500).map((r) => ({
        cells: Array.from(r.querySelectorAll('[role=cell], [role=gridcell]')).map((c) => clean(c.innerText).slice(0, 300)),
        links: linksIn(r),
        mailtos: mailtosIn(r)
      }))
    });
  }
  const labelValues = [];
  for (const dt of Array.from(document.querySelectorAll('dt'))) {
    const dd = dt.nextElementSibling;
    if (dd && dd.tagName === 'DD') labelValues.push({ label: clean(dt.innerText), value: clean(dd.innerText).slice(0, 1000) });
  }
  for (const el of Array.from(document.querySelectorAll('[data-label], [aria-label]'))) {
    const label = el.getAttribute('data-label');
    if (label && el.innerText) labelValues.push({ label: clean(label), value: clean(el.innerText).slice(0, 1000) });
  }
  return {
    url: location.href,
    text: (document.body ? document.body.innerText : '').replace(/[ \t]+/g, ' ').slice(0, 60000),
    tables,
    labelValues: labelValues.slice(0, 200),
    links: linksIn(document.body).length ? Array.from(document.querySelectorAll('a[href]')).map((a) => ({ text: clean(a.innerText).slice(0, 200), href: a.href })).slice(0, 2000) : [],
    mailtos: mailtosIn(document.body)
  };
})()`
