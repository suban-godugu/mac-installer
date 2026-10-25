import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/config'
import { computeScore, tierFor } from '../src/main/data/scoring'
import { toEvaluationRecord } from '../src/main/agents/researchAgent'
import type { EmployeeRecord } from '../src/shared/schemas'

const cfg = DEFAULT_SETTINGS.scoring
const full = { role: 1, department: 1, ate: 1, semiconductorTesting: 1, seniority: 1, business: 1 }

describe('scoring', () => {
  it('uses the configured weights (30/20/20/15/10/5)', () => {
    expect(computeScore(full, cfg)).toBe(100)
    expect(computeScore({ ...full, role: 0 }, cfg)).toBe(70)
    expect(computeScore({ role: 1, department: 0, ate: 0, semiconductorTesting: 0, seniority: 0, business: 0 }, cfg)).toBe(30)
  })

  it('clamps out-of-range component values', () => {
    expect(computeScore({ ...full, role: 5, ate: -3 }, cfg)).toBe(80)
  })

  it('normalises when weights do not sum to 100', () => {
    const doubled = { ...cfg, weights: { role: 60, department: 40, ate: 40, semiconductorTesting: 30, seniority: 20, business: 10 } }
    expect(computeScore({ ...full, role: 0 }, doubled)).toBe(70)
  })

  it('maps scores to tiers at the documented boundaries', () => {
    expect(tierFor(100, cfg)).toBe('Tier 1')
    expect(tierFor(80, cfg)).toBe('Tier 1')
    expect(tierFor(79, cfg)).toBe('Tier 2')
    expect(tierFor(60, cfg)).toBe('Tier 2')
    expect(tierFor(59, cfg)).toBe('Tier 3')
    expect(tierFor(40, cfg)).toBe('Tier 3')
    expect(tierFor(39, cfg)).toBe('Low Priority')
    expect(tierFor(0, cfg)).toBe('Low Priority')
  })

  it('ignores the model-supplied total and tier', () => {
    const emp = { id: 'emp_1', task_id: 't' } as EmployeeRecord
    const rec = toEvaluationRecord(
      emp,
      { employee_ref: 'p1', relevant: true, components: { ...full, role: 0, department: 0 }, relevance_score: 99, priority: 'Tier 1', reason: 'x' },
      cfg
    )
    expect(rec.relevance_score).toBe(50)
    expect(rec.priority).toBe('Tier 3')
  })

  it('is not relevant below the minimum score even if the model says so', () => {
    const emp = { id: 'emp_1', task_id: 't' } as EmployeeRecord
    const zero = { role: 0, department: 0, ate: 0, semiconductorTesting: 0, seniority: 0.5, business: 0 }
    expect(toEvaluationRecord(emp, { employee_ref: 'p1', relevant: true, components: zero, reason: 'x' }, cfg).relevant).toBe(false)
  })
})
