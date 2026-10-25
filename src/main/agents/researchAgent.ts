import type { RolesConfig, ScoringConfig } from '@shared/config'
import {
  ResearchResponseSchema,
  type CompanyRecord,
  type EmployeeRecord,
  type EvaluationRecord,
  type ResearchEvaluation
} from '@shared/schemas'
import type { LlmClient } from './openrouterClient'
import { AiError } from './openrouterClient'
import { researchSystemPrompt } from './prompts/research'
import { computeScore, tierFor } from '../data/scoring'

/**
 * AI #2. Receives only structured company/employee facts (no emails, no credentials)
 * and returns per-component ratings. Totals and tiers are recomputed locally.
 */
export class ResearchAgent {
  constructor(private llm: LlmClient) {}

  async evaluate(
    company: CompanyRecord,
    employees: EmployeeRecord[],
    roles: RolesConfig,
    scoring: ScoringConfig,
    batchSize: number
  ): Promise<EvaluationRecord[]> {
    const out: EvaluationRecord[] = []
    for (let i = 0; i < employees.length; i += batchSize) {
      const batch = employees.slice(i, i + batchSize)
      const evals = await this.evaluateBatch(company, batch, roles, scoring)
      out.push(...evals)
    }
    return out
  }

  private async evaluateBatch(
    company: CompanyRecord,
    batch: EmployeeRecord[],
    roles: RolesConfig,
    scoring: ScoringConfig
  ): Promise<EvaluationRecord[]> {
    const refs = batch.map((_, i) => `p${i + 1}`)
    const payload = {
      company: {
        name: company.name,
        industry: company.industry,
        naics: company.naics,
        location: company.location,
        employee_count: company.employee_count,
        technology: company.technology.slice(0, 1500),
        description: company.description.slice(0, 1500)
      },
      employees: batch.map((e, i) => ({
        employee_ref: refs[i],
        name: e.name,
        role: e.role,
        department: e.department,
        seniority: e.seniority,
        location: e.location
      }))
    }
    const raw = await this.llm.completeJson([
      { role: 'system', content: researchSystemPrompt(roles, scoring) },
      { role: 'user', content: JSON.stringify(payload) }
    ])
    const parsed = ResearchResponseSchema.safeParse(raw)
    if (!parsed.success) throw new AiError('Research agent returned an invalid evaluation format', 'BAD_RESPONSE')

    const byRef = new Map<string, ResearchEvaluation>()
    for (const ev of parsed.data.evaluations) byRef.set(ev.employee_ref, ev)

    return batch.map((emp, i) => {
      const ev = byRef.get(refs[i])
      if (!ev) {
        return {
          employee_id: emp.id,
          task_id: emp.task_id,
          relevant: false,
          relevance_score: 0,
          priority: 'Low Priority',
          reason: 'NOT_AVAILABLE (no evaluation returned)',
          components: { role: 0, department: 0, ate: 0, semiconductorTesting: 0, seniority: 0, business: 0 }
        }
      }
      return toEvaluationRecord(emp, ev, scoring)
    })
  }
}

export function toEvaluationRecord(emp: EmployeeRecord, ev: ResearchEvaluation, scoring: ScoringConfig): EvaluationRecord {
  const score = computeScore(ev.components, scoring)
  return {
    employee_id: emp.id,
    task_id: emp.task_id,
    relevant: ev.relevant && score >= scoring.relevantMinScore,
    relevance_score: score,
    priority: tierFor(score, scoring),
    reason: ev.reason.trim() || 'NOT_AVAILABLE',
    components: ev.components
  }
}
