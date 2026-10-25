import type { ScoringConfig } from '@shared/config'
import type { ScoreComponents, Tier } from '@shared/schemas'

/** Weighted score normalised to 0-100 regardless of how the weights sum. */
export function computeScore(c: ScoreComponents, cfg: ScoringConfig): number {
  const w = cfg.weights
  const total = w.role + w.department + w.ate + w.semiconductorTesting + w.seniority + w.business
  if (total <= 0) return 0
  const clamp = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
  const raw =
    clamp(c.role) * w.role +
    clamp(c.department) * w.department +
    clamp(c.ate) * w.ate +
    clamp(c.semiconductorTesting) * w.semiconductorTesting +
    clamp(c.seniority) * w.seniority +
    clamp(c.business) * w.business
  return Math.round((raw / total) * 100)
}

export function tierFor(score: number, cfg: ScoringConfig): Tier {
  if (score >= cfg.tiers.tier1) return 'Tier 1'
  if (score >= cfg.tiers.tier2) return 'Tier 2'
  if (score >= cfg.tiers.tier3) return 'Tier 3'
  return 'Low Priority'
}
