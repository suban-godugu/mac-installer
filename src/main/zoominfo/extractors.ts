import { NOT_AVAILABLE } from '@shared/config'
import type { RawPageData, RawTable } from '../browser/pageScripts'
import type { NewCompany, NewEmployee } from '../data/repositories/research'
import type { ExtractedPerson } from '../agents/controllerAgent'

const NA = NOT_AVAILABLE
export const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g
const COMPANY_LINK = /\/company\/([\w-]+)(?:\/|$|\?|#)?/i
const PERSON_LINK = /\/(person|contact|people)\/([\w-]+)/i

const or = (v: string | undefined | null): string => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t && !/^(-|—|n\/a|none|null|undefined)$/i.test(t) ? t : NA
}

export function domainOf(website: string): string {
  if (!website || website === NA) return NA
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return NA
  }
}

function headerIndex(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h))
    if (i >= 0) return i
  }
  return -1
}

/** Companies listed on a search-results page. Requires a link to a company profile. */
export function extractCompanyList(data: RawPageData, siteBaseHost: string): NewCompany[] {
  const found = new Map<string, NewCompany>()
  const fromTableRow = new Map<string, Partial<NewCompany>>()

  for (const table of data.tables) {
    const h = table.headers
    const iInd = headerIndex(h, [/industr/i])
    const iLoc = headerIndex(h, [/location|headquarter|hq|country|city/i])
    const iEmp = headerIndex(h, [/employee/i])
    const iWeb = headerIndex(h, [/website|domain|url/i])
    for (const row of table.rows) {
      const link = row.links.find((l) => isCompanyLink(l.href, siteBaseHost))
      if (!link) continue
      fromTableRow.set(link.href, {
        industry: iInd >= 0 ? or(row.cells[iInd]) : NA,
        location: iLoc >= 0 ? or(row.cells[iLoc]) : NA,
        employee_count: iEmp >= 0 ? or(row.cells[iEmp]) : NA,
        website: iWeb >= 0 ? or(row.cells[iWeb]) : NA
      })
    }
  }

  for (const link of data.links) {
    if (!isCompanyLink(link.href, siteBaseHost)) continue
    const name = or(link.text)
    if (name === NA || name.length > 150) continue
    const id = COMPANY_LINK.exec(new URL(link.href).pathname + new URL(link.href).hash)?.[1] ?? NA
    const key = id !== NA ? id : name.toLowerCase()
    if (found.has(key)) continue
    const extra = fromTableRow.get(link.href) ?? {}
    const website = extra.website ?? NA
    found.set(key, {
      zoominfo_id: id,
      name,
      website,
      domain: domainOf(website),
      industry: extra.industry ?? NA,
      naics: NA,
      location: extra.location ?? NA,
      employee_count: extra.employee_count ?? NA,
      technology: NA,
      description: NA,
      profile_url: profileBaseUrl(link.href),
      source: data.url
    })
  }
  return [...found.values()]
}

function isCompanyLink(href: string, siteBaseHost: string): boolean {
  try {
    const u = new URL(href)
    if (!(u.hostname === siteBaseHost || u.hostname.endsWith(`.${siteBaseHost}`))) return false
    const p = u.pathname + u.hash
    return COMPANY_LINK.test(p) && !/\/(employees|people|contacts|technolog|org)/i.test(p)
  } catch {
    return false
  }
}

/** Normalises a company link to its overview/root URL. */
function profileBaseUrl(href: string): string {
  return href.replace(/(\/company\/[\w-]+)\/(overview|summary)\/?$/i, '$1/overview')
}

const LABELS: Record<'website' | 'industry' | 'naics' | 'location' | 'employees' | 'description', RegExp> = {
  website: /^(website|web site|domain|url)$/i,
  industry: /^(primary )?industr(y|ies)$/i,
  naics: /^(naics( code)?s?|naics industry)$/i,
  location: /^(headquarters|hq|location|address|hq location)$/i,
  employees: /^(employees|employee count|# of employees|company size|headcount)$/i,
  description: /^(about|overview|description|company description)$/i
}

function lookupLabel(data: RawPageData, re: RegExp): string {
  for (const lv of data.labelValues) {
    if (re.test(lv.label.replace(/:$/, '').trim())) return or(lv.value)
  }
  const lines = data.text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(lines[i])
    if (m && re.test(m[1].trim())) return or(m[2])
    if (re.test(lines[i].replace(/:$/, '')) && i + 1 < lines.length) return or(lines[i + 1])
  }
  return NA
}

/** Company overview / organization page. Only reads what is visible. */
export function extractCompanyProfile(data: RawPageData, siteBaseHost: string): Partial<NewCompany> {
  let website = lookupLabel(data, LABELS.website)
  if (website === NA) {
    const ext = data.links.find((l) => {
      try {
        const h = new URL(l.href).hostname
        return !h.endsWith(siteBaseHost) && /^https?:/.test(l.href) && l.text && h.includes('.') && l.text.includes('.')
      } catch {
        return false
      }
    })
    if (ext) website = or(ext.text)
  }
  let naics = lookupLabel(data, LABELS.naics)
  const naicsCodes = naics !== NA ? naics.match(/\b\d{6}\b/g) : null
  if (naicsCodes) naics = [...new Set(naicsCodes)].join(', ')
  else {
    const m = /NAICS[^\n\d]{0,40}(\d{6})/i.exec(data.text)
    naics = m ? m[1] : naics
  }
  const description = lookupLabel(data, LABELS.description)
  return {
    website,
    domain: domainOf(website),
    industry: lookupLabel(data, LABELS.industry),
    naics,
    location: lookupLabel(data, LABELS.location),
    employee_count: lookupLabel(data, LABELS.employees),
    description: description === NA ? NA : description.slice(0, 1500)
  }
}

/** Technology / tech-stack page. */
export function extractTechnologies(data: RawPageData): string {
  const items = new Set<string>()
  for (const t of data.tables) {
    const i = headerIndex(t.headers, [/technolog|product|tool|software|vendor/i])
    const col = i >= 0 ? i : 0
    if (i < 0 && !t.headers.some((h) => /categor|technolog/i.test(h))) continue
    for (const r of t.rows) {
      const v = or(r.cells[col])
      if (v !== NA) items.add(v)
    }
  }
  if (!items.size) {
    for (const lv of data.labelValues) if (/technolog|tech stack/i.test(lv.label)) items.add(lv.value)
  }
  return items.size ? [...items].slice(0, 80).join('; ') : NA
}

/** People table on a company employees/contacts page. */
export function extractPeopleFromTables(data: RawPageData, collectedAt: string): NewEmployee[] {
  const people: NewEmployee[] = []
  for (const table of data.tables) {
    const h = table.headers
    const iName = headerIndex(h, [/^(contact )?name$/i, /name/i, /contact/i])
    const iTitle = headerIndex(h, [/job title/i, /^title$/i, /title|role|position/i])
    if (iName < 0 || iTitle < 0) continue
    const iDept = headerIndex(h, [/department|function/i])
    const iSen = headerIndex(h, [/seniority|management level|level/i])
    const iEmail = headerIndex(h, [/e-?mail/i])
    const iLoc = headerIndex(h, [/location|city|country/i])
    for (const row of table.rows) {
      const name = or(row.cells[iName]?.split('\n')[0])
      if (name === NA) continue
      people.push({
        zoominfo_id: personIdFrom(row),
        name,
        role: or(row.cells[iTitle]),
        department: iDept >= 0 ? or(row.cells[iDept]) : NA,
        seniority: iSen >= 0 ? or(row.cells[iSen]) : NA,
        email: visibleEmail(iEmail >= 0 ? row.cells[iEmail] : '', row.mailtos, row.cells),
        location: iLoc >= 0 ? or(row.cells[iLoc]) : NA,
        profile_url: row.links.find((l) => PERSON_LINK.test(l.href))?.href ?? NA,
        source: data.url,
        collected_at: collectedAt
      })
    }
  }
  return people
}

function personIdFrom(row: RawTable['rows'][number]): string {
  for (const l of row.links) {
    const m = PERSON_LINK.exec(l.href)
    if (m) return m[2]
  }
  return NA
}

/** An email is only accepted when it is literally present in the row (cell text or mailto link). */
export function visibleEmail(cell: string | undefined, mailtos: string[], cells: string[]): string {
  const candidates = [
    ...(cell ? (cell.match(EMAIL_IN_TEXT) ?? []) : []),
    ...mailtos,
    ...cells.flatMap((c) => c.match(EMAIL_IN_TEXT) ?? [])
  ]
  const hit = candidates.map((c) => c.trim()).find((c) => EMAIL_RE.test(c))
  return hit ?? NA
}

/**
 * Applies the verbatim rule to AI-structured rows: every value must literally occur in the
 * page text, otherwise it becomes NOT_AVAILABLE. People whose name is not on the page are dropped.
 */
export function enforceVerbatim(people: ExtractedPerson[], pageText: string, source: string, collectedAt: string): NewEmployee[] {
  const hay = pageText.replace(/\s+/g, ' ').toLowerCase()
  const keep = (v: string): string => {
    const t = or(v)
    return t !== NA && hay.includes(t.toLowerCase()) ? t : NA
  }
  const out: NewEmployee[] = []
  for (const p of people) {
    const name = keep(p.name)
    if (name === NA) continue
    const email = keep(p.email)
    out.push({
      zoominfo_id: NA,
      name,
      role: keep(p.role),
      department: keep(p.department),
      seniority: keep(p.seniority),
      email: email !== NA && EMAIL_RE.test(email) ? email : NA,
      location: keep(p.location),
      profile_url: NA,
      source,
      collected_at: collectedAt
    })
  }
  return out
}

/** Builds a sibling URL for a company sub-page when the site uses /company/<id>/<section>. */
export function companySectionUrl(profileUrl: string, section: string): string | null {
  const m = /^(.*\/company\/[\w-]+)(\/[\w-]*)?(.*)$/i.exec(profileUrl)
  if (!m) return null
  return `${m[1]}/${section}`
}
