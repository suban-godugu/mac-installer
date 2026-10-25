import type { Db } from '../db'
import { transaction } from '../db'
import { NOT_AVAILABLE } from '@shared/config'
import type {
  CompanyRecord,
  CompanyStatus,
  EmployeeRecord,
  EvaluationRecord,
  ProspectRow,
  ScoreComponents,
  Tier
} from '@shared/schemas'
import { ScoreComponentsSchema } from '@shared/schemas'
import type { TaskCounts } from '@shared/ipc'
import { newId } from './util'

export type NewCompany = Omit<CompanyRecord, 'id' | 'task_id' | 'idx' | 'status' | 'attempts' | 'error'>
export type NewEmployee = Omit<EmployeeRecord, 'id' | 'task_id' | 'company_id'>

function parseComponents(raw: unknown): ScoreComponents | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = ScoreComponentsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export class ResearchRepo {
  constructor(private db: Db) {}

  /** Adds companies not already present for the task. Returns how many were new. */
  addCompanies(taskId: string, companies: NewCompany[]): number {
    return transaction(this.db, () => {
      const maxRow = this.db.prepare('SELECT COALESCE(MAX(idx), -1) AS m FROM companies WHERE task_id = ?').get(taskId) as {
        m: number
      }
      let idx = maxRow.m + 1
      let added = 0
      const exists = this.db.prepare(
        'SELECT 1 FROM companies WHERE task_id = ? AND ((zoominfo_id != ? AND zoominfo_id = ?) OR lower(name) = lower(?))'
      )
      const insert = this.db.prepare(`INSERT INTO companies
        (id, task_id, idx, zoominfo_id, name, website, domain, industry, naics, location, employee_count, technology, description, profile_url, source, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`)
      for (const c of companies) {
        if (exists.get(taskId, NOT_AVAILABLE, c.zoominfo_id, c.name)) continue
        insert.run(
          newId('co'),
          taskId,
          idx++,
          c.zoominfo_id,
          c.name,
          c.website,
          c.domain,
          c.industry,
          c.naics,
          c.location,
          c.employee_count,
          c.technology,
          c.description,
          c.profile_url,
          c.source
        )
        added++
      }
      return added
    })
  }

  companies(taskId: string): CompanyRecord[] {
    return this.db
      .prepare('SELECT * FROM companies WHERE task_id = ? ORDER BY idx')
      .all(taskId) as unknown as CompanyRecord[]
  }

  company(id: string): CompanyRecord | undefined {
    return this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as unknown as CompanyRecord | undefined
  }

  companyCount(taskId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM companies WHERE task_id = ?').get(taskId) as { n: number }).n
  }

  updateCompany(id: string, fields: Partial<NewCompany>): void {
    const keys = Object.keys(fields) as (keyof NewCompany)[]
    if (!keys.length) return
    const sql = `UPDATE companies SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`
    this.db.prepare(sql).run(...keys.map((k) => String(fields[k] ?? NOT_AVAILABLE)), id)
  }

  setCompanyStatus(id: string, status: CompanyStatus, error = ''): void {
    this.db.prepare('UPDATE companies SET status = ?, error = ? WHERE id = ?').run(status, error, id)
  }

  incrementAttempts(id: string): number {
    this.db.prepare('UPDATE companies SET attempts = attempts + 1 WHERE id = ?').run(id)
    return (this.db.prepare('SELECT attempts FROM companies WHERE id = ?').get(id) as { attempts: number }).attempts
  }

  /** Puts failed / needs-human companies back in the queue. */
  requeueFailed(taskId: string): number {
    const res = this.db
      .prepare(
        "UPDATE companies SET status = 'PENDING', attempts = 0, error = '' WHERE task_id = ? AND status IN ('FAILED', 'NEEDS_HUMAN', 'PROCESSING')"
      )
      .run(taskId)
    return Number(res.changes)
  }

  replaceEmployees(taskId: string, companyId: string, employees: NewEmployee[]): EmployeeRecord[] {
    return transaction(this.db, () => {
      this.db.prepare('DELETE FROM employees WHERE company_id = ?').run(companyId)
      const insert = this.db.prepare(`INSERT INTO employees
        (id, task_id, company_id, zoominfo_id, name, role, department, seniority, email, location, profile_url, source, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      return employees.map((e) => {
        const rec: EmployeeRecord = { ...e, id: newId('emp'), task_id: taskId, company_id: companyId }
        insert.run(
          rec.id,
          taskId,
          companyId,
          rec.zoominfo_id,
          rec.name,
          rec.role,
          rec.department,
          rec.seniority,
          rec.email,
          rec.location,
          rec.profile_url,
          rec.source,
          rec.collected_at
        )
        return rec
      })
    })
  }

  employeesForCompany(companyId: string): EmployeeRecord[] {
    return this.db
      .prepare('SELECT * FROM employees WHERE company_id = ?')
      .all(companyId) as unknown as EmployeeRecord[]
  }

  saveEvaluations(evals: EvaluationRecord[]): void {
    transaction(this.db, () => {
      const stmt = this.db.prepare(`INSERT INTO evaluations (employee_id, task_id, relevant, relevance_score, priority, reason, components)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id) DO UPDATE SET relevant = excluded.relevant, relevance_score = excluded.relevance_score,
          priority = excluded.priority, reason = excluded.reason, components = excluded.components`)
      for (const e of evals) {
        stmt.run(
          e.employee_id,
          e.task_id,
          e.relevant ? 1 : 0,
          e.relevance_score,
          e.priority,
          e.reason,
          JSON.stringify(e.components)
        )
      }
    })
  }

  prospects(taskId: string): ProspectRow[] {
    const rows = this.db
      .prepare(
        `SELECT e.id AS employee_id, e.zoominfo_id, c.name AS company_name, c.domain AS company_domain, c.naics AS company_naics,
          c.location AS company_location, e.name AS employee_name, e.role AS employee_role, e.email AS employee_email,
          e.department, e.profile_url, e.source, e.collected_at,
          v.priority, v.relevance_score, v.reason, v.relevant, v.components
         FROM employees e JOIN companies c ON c.id = e.company_id
         LEFT JOIN evaluations v ON v.employee_id = e.id
         WHERE e.task_id = ? ORDER BY c.idx, v.relevance_score DESC`
      )
      .all(taskId) as Record<string, unknown>[]
    return rows.map((r) => ({
      employee_id: String(r.employee_id),
      zoominfo_id: String(r.zoominfo_id),
      company_name: String(r.company_name),
      company_domain: String(r.company_domain),
      company_naics: String(r.company_naics),
      company_location: String(r.company_location),
      employee_name: String(r.employee_name),
      employee_role: String(r.employee_role),
      employee_email: String(r.employee_email),
      department: String(r.department),
      profile_url: String(r.profile_url),
      source: String(r.source),
      collected_at: String(r.collected_at),
      priority: (r.priority as Tier | null) ?? NOT_AVAILABLE,
      relevance_score: r.relevance_score == null ? null : Number(r.relevance_score),
      reason: r.reason == null ? NOT_AVAILABLE : String(r.reason),
      relevant: Number(r.relevant ?? 0) === 1,
      validation_status: 'VALID',
      validation_notes: [],
      components: parseComponents(r.components)
    }))
  }

  counts(taskId: string): TaskCounts {
    const c = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN status IN ('FAILED','NEEDS_HUMAN') THEN 1 ELSE 0 END) AS failed
         FROM companies WHERE task_id = ?`
      )
      .get(taskId) as { total: number; done: number | null; failed: number | null }
    const e = this.db
      .prepare(
        `SELECT COUNT(*) AS employees,
          SUM(CASE WHEN e.email != ? THEN 1 ELSE 0 END) AS emails,
          SUM(CASE WHEN v.relevant = 1 THEN 1 ELSE 0 END) AS qualified,
          SUM(CASE WHEN v.priority = 'Tier 1' THEN 1 ELSE 0 END) AS t1,
          SUM(CASE WHEN v.priority = 'Tier 2' THEN 1 ELSE 0 END) AS t2,
          SUM(CASE WHEN v.priority = 'Tier 3' THEN 1 ELSE 0 END) AS t3
         FROM employees e LEFT JOIN evaluations v ON v.employee_id = e.id WHERE e.task_id = ?`
      )
      .get(NOT_AVAILABLE, taskId) as Record<string, number | null>
    return {
      companiesTotal: c.total,
      companiesDone: c.done ?? 0,
      companiesFailed: c.failed ?? 0,
      employees: e.employees ?? 0,
      qualified: e.qualified ?? 0,
      tier1: e.t1 ?? 0,
      tier2: e.t2 ?? 0,
      tier3: e.t3 ?? 0,
      businessEmails: e.emails ?? 0
    }
  }
}
