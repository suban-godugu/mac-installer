import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import ExcelJS from 'exceljs'
import { MANDATORY_COLUMNS, NOT_AVAILABLE } from '@shared/config'
import type { ProspectRow } from '@shared/schemas'

type ColumnGetter = (r: ProspectRow) => string | number

export const COLUMN_GETTERS: Record<string, ColumnGetter> = {
  'Company Name': (r) => r.company_name,
  'Employee Name': (r) => r.employee_name,
  'Employee Role': (r) => r.employee_role,
  'Employee Business Email': (r) => r.employee_email || NOT_AVAILABLE,
  Department: (r) => r.department,
  Priority: (r) => r.priority,
  'Relevance Score': (r) => r.relevance_score ?? NOT_AVAILABLE,
  'Qualification Reason': (r) => r.reason,
  'Company NAICS': (r) => r.company_naics,
  'Company Location': (r) => r.company_location,
  Source: (r) => r.source,
  'Collection Timestamp': (r) => r.collected_at,
  'Validation Status': (r) => r.validation_status,
  'Validation Notes': (r) => r.validation_notes.join('; ') || '',
  'Profile URL': (r) => r.profile_url,
  'Company Domain': (r) => r.company_domain
}

export interface ExportOptions {
  path: string
  auditColumns: string[]
  /** Mandatory-only workbook (used for the synthetic test file). */
  mandatoryOnly?: boolean
  mainSheetName?: string
  testData?: boolean
}

function styleHeader(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF5' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
}

/** Writes to a temp file then renames, so a failed export never leaves a corrupt workbook. */
export async function exportProspects(rows: ProspectRow[], opts: ExportOptions): Promise<{ path: string; rows: number }> {
  mkdirSync(dirname(opts.path), { recursive: true })
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Prospect Intelligence Browser'
  wb.created = new Date()

  const main = wb.addWorksheet(opts.mainSheetName ?? 'Prospects')
  main.columns = MANDATORY_COLUMNS.map((c) => ({ header: c, key: c, width: c === 'Employee Business Email' ? 38 : 32 }))
  for (const r of rows) main.addRow(MANDATORY_COLUMNS.map((c) => COLUMN_GETTERS[c](r)))
  styleHeader(main)

  if (!opts.mandatoryOnly) {
    const cols = [...MANDATORY_COLUMNS.filter((c) => !opts.auditColumns.includes(c)), ...opts.auditColumns].filter(
      (c) => COLUMN_GETTERS[c]
    )
    if (!cols.includes('Validation Notes')) cols.push('Validation Notes')
    const audit = wb.addWorksheet('Audit')
    audit.columns = cols.map((c) => ({ header: c, key: c, width: c === 'Qualification Reason' || c === 'Validation Notes' ? 60 : 24 }))
    for (const r of rows) audit.addRow(cols.map((c) => COLUMN_GETTERS[c](r)))
    styleHeader(audit)
  }

  if (opts.testData) {
    wb.title = 'TEST DATA - synthetic records, not real contacts'
    wb.subject = 'TEST DATA'
  }

  const tmp = `${opts.path}.tmp-${process.pid}`
  try {
    await wb.xlsx.writeFile(tmp)
    rmSync(opts.path, { force: true })
    renameSync(tmp, opts.path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  return { path: opts.path, rows: rows.length }
}
