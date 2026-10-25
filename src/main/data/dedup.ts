import { NOT_AVAILABLE } from '@shared/config'
import type { ProspectRow } from '@shared/schemas'

const NA = NOT_AVAILABLE

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|phd|jr|sr|ii|iii|mba|pe)\b\.?/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const normCompany = (c: string): string =>
  c
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(inc|incorporated|corp|corporation|co|ltd|llc|plc|gmbh|ag|sa|limited)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const has = (v: string | null | undefined): v is string => !!v && v !== NA && v.trim() !== ''

function keysFor(r: ProspectRow): string[] {
  const keys: string[] = []
  const name = has(r.employee_name) ? normalizeName(r.employee_name) : ''
  if (has(r.zoominfo_id)) keys.push(`zi:${r.zoominfo_id}`)
  if (has(r.profile_url)) keys.push(`url:${r.profile_url.toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '')}`)
  if (has(r.employee_email)) keys.push(`ce:${normCompany(r.company_name)}|${r.employee_email.toLowerCase()}`)
  if (name) keys.push(`cn:${normCompany(r.company_name)}|${name}`)
  if (name && has(r.company_domain)) keys.push(`dn:${r.company_domain.toLowerCase()}|${name}`)
  return keys
}

/** Higher = more trustworthy record; used to pick the base record of a duplicate group. */
function confidence(r: ProspectRow): number {
  const fields = [r.employee_name, r.employee_role, r.employee_email, r.department, r.profile_url, r.company_location]
  let score = fields.filter(has).length * 10
  if (r.validation_status === 'VALID') score += 25
  if (r.relevance_score !== null) score += 5 + r.relevance_score / 10
  return score
}

const MERGE_FIELDS: (keyof ProspectRow)[] = [
  'zoominfo_id',
  'company_domain',
  'company_naics',
  'company_location',
  'employee_role',
  'employee_email',
  'department',
  'profile_url',
  'source'
]

export interface DedupResult {
  rows: ProspectRow[]
  duplicatesMerged: number
}

/** Groups records sharing any identity key (union-find) and merges each group. */
export function dedupe(rows: ProspectRow[]): DedupResult {
  const parent = rows.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const owner = new Map<string, number>()
  rows.forEach((r, i) => {
    for (const k of keysFor(r)) {
      const j = owner.get(k)
      if (j === undefined) owner.set(k, i)
      else parent[find(i)] = find(j)
    }
  })

  const groups = new Map<number, ProspectRow[]>()
  rows.forEach((r, i) => {
    const root = find(i)
    const g = groups.get(root)
    if (g) g.push(r)
    else groups.set(root, [r])
  })

  const out: ProspectRow[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const sorted = [...group].sort((a, b) => confidence(b) - confidence(a))
    const merged: ProspectRow = { ...sorted[0], validation_notes: [...sorted[0].validation_notes] }
    for (const other of sorted.slice(1)) {
      for (const f of MERGE_FIELDS) {
        const cur = merged[f]
        const alt = other[f]
        if (!has(cur as string) && has(alt as string)) (merged as unknown as Record<string, unknown>)[f] = alt
      }
      if ((other.relevance_score ?? -1) > (merged.relevance_score ?? -1)) {
        merged.relevance_score = other.relevance_score
        merged.priority = other.priority
        merged.reason = other.reason
        merged.relevant = other.relevant
      }
    }
    merged.validation_notes.push(`Merged ${group.length} duplicate records`)
    out.push(merged)
  }
  return { rows: out, duplicatesMerged: rows.length - out.length }
}
