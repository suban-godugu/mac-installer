import type { AppSettings } from '@shared/config'
import type { ProspectRow } from '@shared/schemas'
import { RadarChart } from '../design/charts'
import { AnalysisPanel, EvidencePanel, RecommendationPanel } from '../design/intelligence'
import { EngineeringMetric, KeyValues, StatusBadge, TierTag } from '../design/primitives'
import { COMPONENT_LABELS, VALIDATION, clean, fmtDateTime } from '../lib/domain'
import { ExternalLink, httpsUrl } from '../lib/links'

function confidenceText(score: number, s: AppSettings | null): string | null {
  if (!s) return null
  const t = s.scoring.tiers
  const bands: [string, number][] = [
    ['Tier 1', t.tier1],
    ['Tier 2', t.tier2],
    ['Tier 3', t.tier3]
  ]
  const hit = bands.find(([, v]) => score >= v)
  if (hit) return `${(score - hit[1]).toFixed(0)} pts above the ${hit[0]} threshold (${hit[1]})`
  return `${(t.tier3 - score).toFixed(0)} pts below the Tier 3 threshold (${t.tier3})`
}

export function ProspectInspector({ p, settings, onClose }: { p: ProspectRow; settings: AppSettings | null; onClose: () => void }) {
  const v = VALIDATION[p.validation_status]
  const score = p.relevance_score
  const comps = p.components
  const relevantMin = settings?.scoring.relevantMinScore
  return (
    <AnalysisPanel title={p.employee_name} sub={`${clean(p.employee_role) || 'Role unknown'} - ${p.company_name}`} onClose={onClose}>
      <EvidencePanel
        sections={[
          {
            label: 'Finding',
            icon: 'target',
            children: (
              <div className="stack-sm">
                <div className="row wrap">
                  <TierTag tier={p.priority} />
                  <StatusBadge tone={p.relevant ? 'accent' : 'neutral'}>{p.relevant ? 'Relevant' : 'Not relevant'}</StatusBadge>
                  <StatusBadge tone={v.tone} dot>
                    {v.label}
                  </StatusBadge>
                </div>
                {score != null ? (
                  <>
                    <EngineeringMetric label="Relevance score" value={score.toFixed(0)} unit="/ 100" progress={score / 100} threshold={relevantMin != null ? relevantMin / 100 : undefined} />
                    <div className="small muted">
                      {confidenceText(score, settings)}
                      {relevantMin != null && ` - tick marks the relevance cut-off (${relevantMin}).`}
                    </div>
                  </>
                ) : (
                  <div className="small muted">Not yet scored by the research AI.</div>
                )}
              </div>
            )
          },
          {
            label: 'Score components',
            icon: 'scan',
            hidden: !comps,
            children: comps && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <RadarChart size={280} axes={COMPONENT_LABELS.map((c) => ({ label: c.short, value: comps[c.key] }))} />
              </div>
            )
          },
          {
            label: 'AI reasoning',
            icon: 'sparkle',
            children: clean(p.reason) ? <p className="reasoning">{p.reason}</p> : <p className="muted small">No reasoning recorded.</p>
          },
          {
            label: 'Evidence',
            icon: 'layers',
            children: (
              <KeyValues
                items={[
                  ['Email', clean(p.employee_email) ? <span className="mono">{p.employee_email}</span> : ''],
                  ['Department', clean(p.department)],
                  ['Company', p.company_name],
                  ['Domain', clean(p.company_domain)],
                  ['NAICS', clean(p.company_naics)],
                  ['Location', clean(p.company_location)],
                  ['Profile', <ExternalLink key="p" href={httpsUrl(p.profile_url)}>ZoomInfo profile</ExternalLink>],
                  ['Source', clean(p.source) ? <ExternalLink key="s" href={httpsUrl(p.source)}>{p.source}</ExternalLink> : ''],
                  ['Collected', clean(p.collected_at) ? fmtDateTime(p.collected_at) : '']
                ]}
              />
            )
          },
          {
            label: 'Validation notes',
            icon: 'shield',
            hidden: p.validation_notes.length === 0,
            children: (
              <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
                {p.validation_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )
          },
          {
            label: 'Next action',
            icon: 'zap',
            children: (
              <RecommendationPanel tone={v.tone === 'neutral' ? 'accent' : v.tone} title={v.label}>
                {v.action}
              </RecommendationPanel>
            )
          }
        ]}
      />
    </AnalysisPanel>
  )
}
