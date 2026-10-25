import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, rmSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { openDb } from '../src/main/data/db'
import { createRepos } from '../src/main/data/repositories'
import { DEFAULT_SETTINGS, MANDATORY_COLUMNS } from '../src/shared/config'
import { exportProspects } from '../src/main/data/excelExport'
import { SecretStore, type Cipher } from '../src/main/secrets'
import { HumanGate } from '../src/main/workflow/humanGate'
import { withRetry, StopSignal } from '../src/main/workflow/retry'
import { RateLimiter } from '../src/main/browser/rateLimiter'

const NA = 'NOT_AVAILABLE'
const company = (name: string, zid: string) => ({
  zoominfo_id: zid,
  name,
  website: NA,
  domain: NA,
  industry: NA,
  naics: '334413',
  location: NA,
  employee_count: NA,
  technology: NA,
  description: NA,
  profile_url: `https://app.zoominfo.com/company/${zid}`,
  source: 'test'
})

describe('database repositories', () => {
  it('stores tasks, checkpoints, companies, employees and evaluations', () => {
    const repos = createRepos(openDb(':memory:'))
    const task = repos.tasks.create('t', null, DEFAULT_SETTINGS)
    expect(repos.research.addCompanies(task.id, [company('A Co', '1'), company('B Co', '2'), company('a co', '3')])).toBe(2)
    expect(repos.research.addCompanies(task.id, [company('B Co', '2')])).toBe(0)
    const [a] = repos.research.companies(task.id)
    const emps = repos.research.replaceEmployees(task.id, a.id, [
      { zoominfo_id: NA, name: 'Ann', role: 'Head of Test', department: NA, seniority: NA, email: 'ann@a.example.com', location: NA, profile_url: NA, source: 's', collected_at: 'now' },
      { zoominfo_id: NA, name: 'Bob', role: 'HR', department: NA, seniority: NA, email: NA, location: NA, profile_url: NA, source: 's', collected_at: 'now' }
    ])
    repos.research.saveEvaluations([
      { employee_id: emps[0].id, task_id: task.id, relevant: true, relevance_score: 90, priority: 'Tier 1', reason: 'r', components: { role: 1, department: 1, ate: 1, semiconductorTesting: 1, seniority: 1, business: 1 } },
      { employee_id: emps[1].id, task_id: task.id, relevant: false, relevance_score: 5, priority: 'Low Priority', reason: 'r', components: { role: 0, department: 0, ate: 0, semiconductorTesting: 0, seniority: 0, business: 0 } }
    ])
    repos.research.setCompanyStatus(a.id, 'COMPLETED')
    const c = repos.research.counts(task.id)
    expect(c).toMatchObject({ companiesTotal: 2, companiesDone: 1, employees: 2, qualified: 1, tier1: 1, businessEmails: 1 })

    // re-collecting a company replaces its employees instead of duplicating them
    repos.research.replaceEmployees(task.id, a.id, [])
    expect(repos.research.counts(task.id).employees).toBe(0)

    repos.tasks.saveCheckpoint({
      task_id: task.id,
      stage: 'PROCESS_COMPANIES',
      company_index: 1,
      current_company_id: a.id,
      current_tab_id: 'tab_002',
      current_url: 'u',
      search: {},
      results_url: '',
      results_page: 2,
      human: null,
      updated_at: ''
    })
    expect(repos.tasks.getCheckpoint(task.id)).toMatchObject({ stage: 'PROCESS_COMPANIES', company_index: 1, results_page: 2 })

    repos.research.setCompanyStatus(a.id, 'FAILED', 'x')
    expect(repos.research.requeueFailed(task.id)).toBe(1)
  })

  it('merges stored settings over defaults', () => {
    const repos = createRepos(openDb(':memory:'))
    const s = repos.settings.get()
    s.search.naics = ['111111']
    repos.settings.save(s)
    expect(repos.settings.get().search.naics).toEqual(['111111'])
    expect(repos.settings.get().roles.highPriority.length).toBeGreaterThan(5)
  })
})

describe('secret store', () => {
  const cipher: Cipher = {
    isAvailable: () => true,
    encrypt: (p) => Buffer.from(p.split('').reverse().join('')),
    decrypt: (b) => b.toString().split('').reverse().join('')
  }
  it('never stores keys in plain text', () => {
    const repos = createRepos(openDb(':memory:'))
    const store = new SecretStore(repos.settings, cipher)
    store.set('controller', 'sk-or-secret')
    expect(repos.settings.getRaw('secret:openrouter:controller')).not.toContain('sk-or-secret')
    expect(store.get('controller')).toBe('sk-or-secret')
    expect(store.has('research')).toBe(false)
  })
  it('refuses to store keys without OS encryption', () => {
    const store = new SecretStore(createRepos(openDb(':memory:')).settings, { ...cipher, isAvailable: () => false })
    expect(() => store.set('research', 'k')).toThrow()
  })
})

describe('excel export', () => {
  it('always writes the four mandatory columns first, plus an Audit sheet', async () => {
    const path = join(tmpdir(), `vpib-test-${Date.now()}.xlsx`)
    await exportProspects(
      [
        {
          employee_id: '1',
          zoominfo_id: NA,
          company_name: 'Example Semiconductor (TEST DATA)',
          company_domain: 'example.com',
          company_naics: '334413',
          company_location: 'Austin',
          employee_name: 'John Smith',
          employee_role: 'Director of Test Engineering',
          employee_email: 'john.smith@example.com',
          department: 'Engineering',
          profile_url: NA,
          priority: 'Tier 1',
          relevance_score: 96,
          reason: 'r',
          relevant: true,
          source: 's',
          collected_at: 'now',
          validation_status: 'VALID',
          validation_notes: []
        }
      ],
      { path, auditColumns: ['Department', 'Priority'] }
    )
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    expect((wb.worksheets[0].getRow(1).values as unknown[]).slice(1)).toEqual([...MANDATORY_COLUMNS])
    expect((wb.worksheets[0].getRow(2).values as unknown[]).slice(1)).toEqual([
      'Example Semiconductor (TEST DATA)',
      'John Smith',
      'Director of Test Engineering',
      'john.smith@example.com'
    ])
    const audit = (wb.getWorksheet('Audit')!.getRow(1).values as unknown[]).slice(1)
    expect(audit.slice(0, 4)).toEqual([...MANDATORY_COLUMNS])
    expect(audit).toContain('Priority')
    expect(existsSync(`${path}.tmp-${process.pid}`)).toBe(false)
    rmSync(path)
  })
})

describe('retry, rate limit and human gate', () => {
  it('retries a bounded number of times', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('boom')
        },
        { attempts: 3, baseDelayMs: 1 }
      )
    ).rejects.toThrow('boom')
    expect(calls).toBe(3)
  })

  it('does not retry stop signals', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new StopSignal()
        },
        { attempts: 3, baseDelayMs: 1 }
      )
    ).rejects.toBeInstanceOf(StopSignal)
    expect(calls).toBe(1)
  })

  it('rate limiter enforces per-minute caps', () => {
    let now = 0
    const rl = new RateLimiter(() => 2, () => 0, () => now)
    expect(rl.delayNeeded()).toBe(0)
    ;(rl as unknown as { stamps: number[] }).stamps.push(0, 10)
    now = 20
    expect(rl.delayNeeded()).toBe(59980)
  })

  it('human gate resolves only after verification succeeds', async () => {
    const gate = new HumanGate(() => false, 10)
    let solved = false
    setTimeout(() => (solved = true), 40)
    const start = Date.now()
    await gate.wait({ reason: 'MFA', message: 'm' }, async () => solved)
    expect(Date.now() - start).toBeGreaterThanOrEqual(30)
    expect(gate.pending()).toBeNull()
  })

  it('human gate stops when the task is stopped', async () => {
    let stopped = false
    const gate = new HumanGate(() => stopped, 10)
    setTimeout(() => (stopped = true), 20)
    await expect(gate.wait({ reason: 'CAPTCHA', message: 'm' }, async () => false)).rejects.toBeInstanceOf(StopSignal)
  })
})
