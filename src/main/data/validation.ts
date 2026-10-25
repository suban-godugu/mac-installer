import { NOT_AVAILABLE } from '@shared/config'
import type { ProspectRow, ValidationStatus } from '@shared/schemas'
import { EMAIL_RE } from '../zoominfo/extractors'

const NA = NOT_AVAILABLE
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'qq.com',
  '163.com'
])

const missing = (v: string | null | undefined): boolean => !v || v.trim() === '' || v === NA

/** Checks every row before export. Never generates data; invalid emails are blanked to NOT_AVAILABLE. */
export function validateRow(input: ProspectRow): ProspectRow {
  const row: ProspectRow = { ...input, validation_notes: [] }
  const notes = row.validation_notes
  const statuses: ValidationStatus[] = []

  if (missing(row.company_name)) notes.push('Missing company name')
  if (missing(row.employee_name)) notes.push('Missing employee name')
  if (missing(row.employee_role)) notes.push('Missing role')
  if (notes.length) statuses.push('MISSING_FIELDS')

  if (missing(row.source)) {
    notes.push('Missing source')
    statuses.push('MISSING_SOURCE')
  }

  if (missing(row.employee_email)) {
    row.employee_email = NA
    statuses.push('MISSING_EMAIL')
  } else {
    const email = row.employee_email.trim()
    const domain = email.split('@')[1]?.toLowerCase() ?? ''
    if (!EMAIL_RE.test(email)) {
      notes.push(`Invalid email format: ${email}`)
      row.employee_email = NA
      statuses.push('INVALID_EMAIL')
    } else if (PERSONAL_DOMAINS.has(domain)) {
      notes.push('Personal (non-business) email removed')
      row.employee_email = NA
      statuses.push('INVALID_EMAIL')
    } else {
      row.employee_email = email
      if (!missing(row.company_domain) && !(domain === row.company_domain || domain.endsWith(`.${row.company_domain}`))) {
        notes.push(`Email domain ${domain} differs from company domain ${row.company_domain}`)
      }
    }
  }

  if (row.relevance_score === null || row.priority === NA) {
    notes.push('Not evaluated by research agent')
    statuses.push('NOT_QUALIFIED')
  } else if (!row.relevant) {
    statuses.push('NOT_QUALIFIED')
  }

  row.validation_status = statuses[0] ?? 'VALID'
  return row
}

export function validateRows(rows: ProspectRow[]): ProspectRow[] {
  return rows.map(validateRow)
}
