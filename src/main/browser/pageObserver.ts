import type { Page } from 'playwright-core'
import { OBSERVE_SCRIPT, EXTRACT_SCRIPT, type RawSnapshot, type RawPageData, type ObservedElement } from './pageScripts'
import { detectPage, type Detection, type DetectorConfig } from '../zoominfo/detectors'

export interface Observation {
  tab_id: string
  url: string
  title: string
  detection: Detection
  headings: string[]
  text_excerpt: string
  elements: ObservedElement[]
  raw: RawSnapshot
}

export async function snapshot(page: Page): Promise<RawSnapshot> {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
  return (await page.evaluate(OBSERVE_SCRIPT)) as RawSnapshot
}

export async function observe(page: Page, tabId: string, cfg: DetectorConfig): Promise<Observation> {
  const raw = await snapshot(page)
  return {
    tab_id: tabId,
    url: raw.url,
    title: raw.title,
    detection: detectPage(raw, cfg),
    headings: raw.headings,
    text_excerpt: raw.text.slice(0, 3000),
    elements: raw.elements,
    raw
  }
}

export async function pageData(page: Page): Promise<RawPageData> {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
  return (await page.evaluate(EXTRACT_SCRIPT)) as RawPageData
}

/** Compact, credential-free view of the page for the controller model. */
export function observationForModel(obs: Observation, tabs: { tab_id: string; purpose: string; company_id: string | null }[]): string {
  const els = obs.elements
    .filter((e) => !e.sensitive)
    .map((e) => {
      const parts = [e.id, e.role || e.tag]
      if (e.type) parts.push(`type=${e.type}`)
      parts.push(JSON.stringify(e.name))
      if (e.href) parts.push(`href=${e.href.slice(0, 120)}`)
      if (e.checked !== null) parts.push(`checked=${e.checked}`)
      if (e.disabled) parts.push('disabled')
      if (e.options.length) parts.push(`options=${JSON.stringify(e.options.slice(0, 15))}`)
      return parts.join(' ')
    })
  return JSON.stringify({
    tab_id: obs.tab_id,
    url: obs.url,
    title: obs.title,
    page_kind: obs.detection.kind,
    headings: obs.headings,
    tabs,
    text_excerpt: obs.text_excerpt,
    elements: els
  })
}
