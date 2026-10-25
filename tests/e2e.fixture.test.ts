import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ExcelJS from 'exceljs'
import { afterAll, describe, expect, it } from 'vitest'
import { runFixtureWorkflow, type FixtureRunResult } from './fixture/harness'
import { MANDATORY_COLUMNS } from '../src/shared/config'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const hasChrome = process.platform !== 'win32' || existsSync(CHROME)

describe.skipIf(!hasChrome)('fixture end-to-end workflow (real Chrome, mocked AI)', () => {
  let run: FixtureRunResult
  afterAll(async () => run?.close())

  it('runs search -> companies -> employees -> qualification -> validation -> dedup -> Excel, with human login and resume', async () => {
    run = await runFixtureWorkflow({ workDir: join(tmpdir(), 'vpib-e2e'), maxCompanies: 3, interruptAfterCompanies: 1 })
    const task = run.repos.tasks.get(run.taskId)!
    const errors = run.repos.tasks.errors(run.taskId)
    expect(errors.filter((e) => e.kind === 'TASK_FAILED'), JSON.stringify(errors)).toHaveLength(0)
    expect(task.status).toBe('COMPLETED')
    expect(task.stage).toBe('DONE')

    // Human-in-the-loop: login page triggered the gate and the run continued after the "user" logged in.
    expect(run.humanEvents).toContain('LOGIN_REQUIRED')

    const companies = run.repos.research.companies(run.taskId)
    expect(companies).toHaveLength(3)
    expect(companies.every((c) => c.status === 'COMPLETED')).toBe(true)
    const first = companies.find((c) => c.zoominfo_id === '1001')!
    expect(first.naics).toBe('334413')
    expect(first.domain).toBe('semi-one.example.com')
    expect(first.technology).toContain('Advantest V93000')

    const counts = run.repos.research.counts(run.taskId)
    expect(counts.employees).toBe(11)
    expect(counts.tier1).toBeGreaterThan(0)

    const exp = run.repos.tasks.lastExport(run.taskId)!
    expect(exp.status).toBe('OK')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(exp.path)
    const sheet = wb.worksheets[0]
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...MANDATORY_COLUMNS])
    const rows = sheet.getSheetValues().slice(2).filter(Boolean) as unknown[][]
    const names = rows.map((r) => r[2])
    // HR / recruiting / finance filtered out as not relevant
    expect(names).not.toContain('David Brown')
    expect(names).not.toContain('Sara Kim')
    expect(names).not.toContain('Tom Wright')
    // John Smith appears in two companies with the same person id: merged into one row
    expect(names.filter((n) => n === 'John Smith')).toHaveLength(1)
    // Missing email stays NOT_AVAILABLE, personal email removed, never invented
    expect(rows.find((r) => r[2] === 'Maria Garcia')![4]).toBe('NOT_AVAILABLE')
    expect(rows.find((r) => r[2] === 'Kevin Lee')![4]).toBe('NOT_AVAILABLE')
    expect(rows.find((r) => r[2] === 'Priya Raman')![4]).toBe('priya.raman@semi-one.example.com')
    expect(wb.getWorksheet('Audit')).toBeDefined()
  })
})
