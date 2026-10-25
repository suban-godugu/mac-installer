import { describe, expect, it } from 'vitest'
import { validateRow } from '../src/main/data/validation'
import { dedupe, normalizeName } from '../src/main/data/dedup'
import type { ProspectRow } from '../src/shared/schemas'

const base = (over: Partial<ProspectRow> = {}): ProspectRow => ({
  employee_id: 'e1',
  zoominfo_id: 'NOT_AVAILABLE',
  company_name: 'Example Semiconductor (TEST DATA)',
  company_domain: 'semi.example.com',
  company_naics: '334413',
  company_location: 'Austin',
  employee_name: 'John Smith',
  employee_role: 'Director of Test Engineering',
  employee_email: 'john.smith@semi.example.com',
  department: 'Engineering',
  profile_url: 'NOT_AVAILABLE',
  priority: 'Tier 1',
  relevance_score: 96,
  reason: 'Direct test engineering ownership',
  relevant: true,
  source: 'https://app.example.com/company/1',
  collected_at: '2026-01-01T00:00:00Z',
  validation_status: 'VALID',
  validation_notes: [],
  ...over
})

describe('validation', () => {
  it('accepts a complete record', () => {
    expect(validateRow(base()).validation_status).toBe('VALID')
  })

  it('flags missing required fields and missing source', () => {
    expect(validateRow(base({ employee_role: 'NOT_AVAILABLE' })).validation_status).toBe('MISSING_FIELDS')
    expect(validateRow(base({ company_name: '' })).validation_status).toBe('MISSING_FIELDS')
    expect(validateRow(base({ source: '' })).validation_status).toBe('MISSING_SOURCE')
  })

  it('keeps NOT_AVAILABLE for missing email and never generates one', () => {
    const r = validateRow(base({ employee_email: 'NOT_AVAILABLE' }))
    expect(r.validation_status).toBe('MISSING_EMAIL')
    expect(r.employee_email).toBe('NOT_AVAILABLE')
  })

  it('blanks invalid and personal emails', () => {
    const bad = validateRow(base({ employee_email: 'john at semi' }))
    expect(bad.validation_status).toBe('INVALID_EMAIL')
    expect(bad.employee_email).toBe('NOT_AVAILABLE')
    const personal = validateRow(base({ employee_email: 'john@gmail.com' }))
    expect(personal.employee_email).toBe('NOT_AVAILABLE')
  })

  it('notes (but keeps) emails on a different domain', () => {
    const r = validateRow(base({ employee_email: 'john@other.example.org' }))
    expect(r.validation_status).toBe('VALID')
    expect(r.validation_notes.join()).toMatch(/differs/)
  })

  it('marks unevaluated rows', () => {
    expect(validateRow(base({ relevance_score: null, priority: 'NOT_AVAILABLE' })).validation_status).toBe('NOT_QUALIFIED')
  })
})

describe('deduplication', () => {
  it('normalises names', () => {
    expect(normalizeName('Dr. José  Álvarez, PhD')).toBe('jose alvarez')
  })

  it('merges company + name duplicates and keeps the most complete data', () => {
    const a = base({ employee_id: 'a', employee_email: 'NOT_AVAILABLE', relevance_score: 70, priority: 'Tier 2' })
    const b = base({ employee_id: 'b', employee_name: 'john  smith', department: 'NOT_AVAILABLE' })
    const { rows, duplicatesMerged } = dedupe([a, b])
    expect(duplicatesMerged).toBe(1)
    expect(rows[0].employee_email).toBe('john.smith@semi.example.com')
    expect(rows[0].department).toBe('Engineering')
    expect(rows[0].relevance_score).toBe(96)
  })

  it('merges by ZoomInfo id, profile URL and company + email across signals', () => {
    const rows = [
      base({ employee_id: '1', zoominfo_id: 'Z1', employee_name: 'J. Smith' }),
      base({ employee_id: '2', zoominfo_id: 'Z1', company_name: 'Other Co', employee_email: 'NOT_AVAILABLE' }),
      base({ employee_id: '3', profile_url: 'https://x/p/9', employee_name: 'Ann Lee', employee_email: 'ann@semi.example.com' }),
      base({ employee_id: '4', profile_url: 'https://x/p/9/', employee_name: 'Ann B. Lee', employee_email: 'NOT_AVAILABLE' }),
      base({ employee_id: '5', employee_name: 'Bob Stone', employee_email: 'bob@semi.example.com' }),
      base({ employee_id: '6', employee_name: 'Robert Stone', employee_email: 'BOB@semi.example.com' })
    ]
    const res = dedupe(rows)
    expect(res.rows).toHaveLength(3)
    expect(res.duplicatesMerged).toBe(3)
  })

  it('keeps different people at the same company', () => {
    const res = dedupe([base(), base({ employee_id: 'x', employee_name: 'Jane Doe', employee_email: 'jane@semi.example.com' })])
    expect(res.rows).toHaveLength(2)
  })
})
