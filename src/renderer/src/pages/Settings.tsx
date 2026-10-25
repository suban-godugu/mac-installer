import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppSettings, ScoringWeights } from '@shared/config'
import type { AiKind } from '@shared/ipc'
import { api, errorText } from '../hooks'
import { useConfirm } from '../design/Dialog'
import { Icon, type IconName } from '../design/Icon'
import { ErrorState, PageLoading } from '../design/states'
import { PageHeader, Panel, StatusBadge } from '../design/primitives'
import { useToast } from '../design/toast'

const lines = (v: string[]): string => v.join('\n')
const fromLines = (s: string): string[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'ai', label: 'AI services', icon: 'cpu' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'targeting', label: 'Targeting', icon: 'target' },
  { id: 'scoring', label: 'Scoring', icon: 'scan' },
  { id: 'output', label: 'Output', icon: 'download' },
  { id: 'pacing', label: 'Pacing & recovery', icon: 'clock' }
]

const WEIGHT_LABELS: Record<keyof ScoringWeights, string> = {
  role: 'Role',
  department: 'Department',
  ate: 'ATE',
  semiconductorTesting: 'Semiconductor testing',
  seniority: 'Seniority',
  business: 'Business'
}
const WEIGHT_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)']

export function Settings() {
  const [s, setS] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [active, setActive] = useState('ai')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const [confirm, confirmNode] = useConfirm()

  const load = (): void => {
    setLoadError(null)
    api.settings
      .get()
      .then((v) => {
        setS(v)
        setSaved(JSON.stringify(v))
      })
      .catch((e) => setLoadError(errorText(e)))
  }
  useEffect(load, [])

  useEffect(() => {
    if (!s) return
    const root = document.querySelector('.app-scroll')
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id.replace('settings-', ''))
      },
      { root, rootMargin: '0px 0px -65% 0px' }
    )
    SECTIONS.forEach((x) => {
      const el = document.getElementById(`settings-${x.id}`)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [!!s])

  const dirty = useMemo(() => !!s && JSON.stringify(s) !== saved, [s, saved])

  if (loadError && !s) return <div className="page"><ErrorState title="Could not load settings" message={loadError} onRetry={load} /></div>
  if (!s) return <PageLoading />

  const update = (fn: (draft: AppSettings) => void): void => {
    const next = structuredClone(s)
    fn(next)
    setS(next)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await api.settings.save(s)
      setSaved(JSON.stringify(s))
      toast('Settings saved. New tasks use these settings; existing tasks keep the settings they started with.', 'success')
    } catch (e) {
      toast(errorText(e), 'critical')
    } finally {
      setSaving(false)
    }
  }

  const weights = s.scoring.weights
  const weightKeys = Object.keys(weights) as (keyof ScoringWeights)[]
  const weightSum = weightKeys.reduce((a, k) => a + weights[k], 0)
  const t = s.scoring.tiers
  const tierOrderOk = t.tier1 > t.tier2 && t.tier2 > t.tier3

  return (
    <div className="page">
      <PageHeader
        eyebrow="System"
        title="Settings"
        desc="Configure AI services, search scope, targeting, scoring and pacing. Changes apply to new tasks."
        actions={
          <>
            <button
              className="btn"
              onClick={() =>
                confirm({
                  title: 'Reset settings to defaults?',
                  body: 'All settings except API keys return to their defaults. This is applied immediately.',
                  confirmLabel: 'Reset settings',
                  danger: true,
                  onConfirm: () =>
                    void api.settings
                      .reset()
                      .then((v) => {
                        setS(v)
                        setSaved(JSON.stringify(v))
                        toast('Settings reset to defaults', 'success')
                      })
                      .catch((e) => toast(errorText(e), 'critical'))
                })
              }
            >
              <Icon name="retry" size={14} /> Reset to defaults
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
              <Icon name="check" size={14} /> Save settings
            </button>
          </>
        }
      />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <a
              key={x.id}
              href={`#settings-${x.id}`}
              aria-current={active === x.id ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(`settings-${x.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                setActive(x.id)
              }}
            >
              <Icon name={x.icon} size={14} />
              {x.label}
            </a>
          ))}
        </nav>

        <div className="stack">
          <Section id="ai" title="AI services" icon="cpu" sub="OpenRouter keys are stored encrypted with the operating system key store and only used by the local backend. They are never sent to this window.">
            <div className="grid-2">
              <AiConfig kind="controller" title="AI #1 - Browser controller" desc="Plans and executes browser actions." model={s.ai.controllerModel} onModel={(m) => update((d) => (d.ai.controllerModel = m))} />
              <AiConfig kind="research" title="AI #2 - Research agent" desc="Scores employees for ATE / semiconductor-test relevance." model={s.ai.researchModel} onModel={(m) => update((d) => (d.ai.researchModel = m))} />
            </div>
          </Section>

          <Section id="search" title="Search" icon="search" sub="What the controller searches for in ZoomInfo.">
            <div className="form-grid">
              <Field label="Task name">
                <input value={s.search.name} onChange={(e) => update((d) => (d.search.name = e.target.value))} />
              </Field>
              <Field label="ZoomInfo start URL">
                <input className="mono" value={s.search.zoominfoStartUrl} onChange={(e) => update((d) => (d.search.zoominfoStartUrl = e.target.value))} />
              </Field>
              <Field label="Industries" hint="One per line">
                <textarea rows={3} value={lines(s.search.industry)} onChange={(e) => update((d) => (d.search.industry = fromLines(e.target.value)))} />
              </Field>
              <Field label="NAICS codes" hint="One per line">
                <textarea rows={3} value={lines(s.search.naics)} onChange={(e) => update((d) => (d.search.naics = fromLines(e.target.value)))} />
              </Field>
              <NumberField label="Max companies per task" min={1} value={s.search.maxCompanies} onChange={(v) => update((d) => (d.search.maxCompanies = v))} />
              <NumberField label="Max employees per company" min={1} value={s.search.maxEmployeesPerCompany} onChange={(v) => update((d) => (d.search.maxEmployeesPerCompany = v))} />
              <label className="check">
                <input type="checkbox" checked={s.search.requireGoogleAuth} onChange={(e) => update((d) => (d.search.requireGoogleAuth = e.target.checked))} />
                Require Google sign-in before starting
              </label>
            </div>
          </Section>

          <Section id="targeting" title="Target company & roles" icon="target" sub="Who the research AI should prioritise.">
            <div className="form-grid">
              <Field label="Target company">
                <input value={s.roles.targetCompany} onChange={(e) => update((d) => (d.roles.targetCompany = e.target.value))} />
              </Field>
              <Field label="Target business" hint="One per line">
                <textarea rows={5} value={lines(s.roles.targetBusiness)} onChange={(e) => update((d) => (d.roles.targetBusiness = fromLines(e.target.value)))} />
              </Field>
              <Field label="Highest-priority roles" hint="One per line">
                <textarea rows={8} value={lines(s.roles.highPriority)} onChange={(e) => update((d) => (d.roles.highPriority = fromLines(e.target.value)))} />
              </Field>
              <Field label="Second-priority roles" hint="One per line">
                <textarea rows={8} value={lines(s.roles.secondPriority)} onChange={(e) => update((d) => (d.roles.secondPriority = fromLines(e.target.value)))} />
              </Field>
              <Field label="Low-priority functions" hint="One per line">
                <textarea rows={6} value={lines(s.roles.lowPriority)} onChange={(e) => update((d) => (d.roles.lowPriority = fromLines(e.target.value)))} />
              </Field>
            </div>
          </Section>

          <Section id="scoring" title="Scoring" icon="scan" sub="Component weights and the tier thresholds applied to the normalised 0-100 score.">
            <div className="stack">
              <div className="stack-sm">
                <span className="label-micro">Weight composition (total {weightSum})</span>
                <div className="weight-bar" role="img" aria-label={`Weights: ${weightKeys.map((k) => `${WEIGHT_LABELS[k]} ${weights[k]}`).join(', ')}`}>
                  {weightSum > 0 &&
                    weightKeys
                      .filter((k) => weights[k] > 0)
                      .map((k) => (
                        <span key={k} style={{ flexGrow: weights[k], background: WEIGHT_COLORS[weightKeys.indexOf(k)] }} title={`${WEIGHT_LABELS[k]}: ${Math.round((weights[k] / weightSum) * 100)}%`}>
                          {Math.round((weights[k] / weightSum) * 100)}%
                        </span>
                      ))}
                </div>
              </div>
              <div className="form-grid-3">
                {weightKeys.map((k, i) => (
                  <NumberField
                    key={k}
                    label={
                      <>
                        <span className="legend-swatch" style={{ background: WEIGHT_COLORS[i] }} />
                        {WEIGHT_LABELS[k]} weight
                      </>
                    }
                    value={weights[k]}
                    onChange={(v) => update((d) => (d.scoring.weights[k] = v))}
                  />
                ))}
              </div>
              <hr className="divider" />
              <div className="stack-sm">
                <span className="label-micro">Tier bands</span>
                <TierScale t={t} relevant={s.scoring.relevantMinScore} />
                {!tierOrderOk && (
                  <span className="field-error" role="alert">
                    Thresholds should descend: Tier 1 &gt; Tier 2 &gt; Tier 3.
                  </span>
                )}
              </div>
              <div className="form-grid-3">
                <NumberField label="Tier 1 from" suffix="pts" value={t.tier1} max={100} invalid={!tierOrderOk} onChange={(v) => update((d) => (d.scoring.tiers.tier1 = v))} />
                <NumberField label="Tier 2 from" suffix="pts" value={t.tier2} max={100} invalid={!tierOrderOk} onChange={(v) => update((d) => (d.scoring.tiers.tier2 = v))} />
                <NumberField label="Tier 3 from" suffix="pts" value={t.tier3} max={100} invalid={!tierOrderOk} onChange={(v) => update((d) => (d.scoring.tiers.tier3 = v))} />
                <NumberField label='Minimum score to be "Relevant"' suffix="pts" max={100} value={s.scoring.relevantMinScore} onChange={(v) => update((d) => (d.scoring.relevantMinScore = v))} />
              </div>
            </div>
          </Section>

          <Section id="output" title="Output" icon="download" sub="Excel export location and content.">
            <div className="form-grid">
              <Field label="Output folder" hint="Blank = the Documents folder, in this app's exports directory">
                <input className="mono" value={s.output.outputDir} onChange={(e) => update((d) => (d.output.outputDir = e.target.value))} />
              </Field>
              <label className="check" style={{ alignSelf: 'end', paddingBottom: 6 }}>
                <input type="checkbox" checked={s.output.qualifiedOnly} onChange={(e) => update((d) => (d.output.qualifiedOnly = e.target.checked))} />
                Export only relevant (qualified) profiles
              </label>
              <Field label="Audit sheet columns" hint="One per line. The four mandatory columns are always included.">
                <textarea rows={8} value={lines(s.output.auditColumns)} onChange={(e) => update((d) => (d.output.auditColumns = fromLines(e.target.value)))} />
              </Field>
            </div>
          </Section>

          <Section id="pacing" title="Pacing & recovery" icon="clock" sub="Rate limits and retry behaviour that keep automation safe.">
            <div className="stack">
              <div className="form-grid-3">
                <NumberField label="Actions per minute" suffix="/min" value={s.runtime.actionsPerMinute} onChange={(v) => update((d) => (d.runtime.actionsPerMinute = v))} />
                <NumberField label="Page opens per minute" suffix="/min" value={s.runtime.pageOpensPerMinute} onChange={(v) => update((d) => (d.runtime.pageOpensPerMinute = v))} />
                <NumberField label="Min delay between actions" suffix="ms" value={s.runtime.minActionDelayMs} onChange={(v) => update((d) => (d.runtime.minActionDelayMs = v))} />
                <NumberField label="Max controller steps per goal" value={s.runtime.maxControllerSteps} onChange={(v) => update((d) => (d.runtime.maxControllerSteps = v))} />
                <NumberField label="Retry attempts" value={s.runtime.retryAttempts} onChange={(v) => update((d) => (d.runtime.retryAttempts = v))} />
                <NumberField label="AI timeout" suffix="ms" value={s.runtime.aiTimeoutMs} onChange={(v) => update((d) => (d.runtime.aiTimeoutMs = v))} />
              </div>
              <Field label="Allowed domains" hint="One per line. Navigation outside these domains is blocked.">
                <textarea rows={3} value={lines(s.runtime.allowedDomains)} onChange={(e) => update((d) => (d.runtime.allowedDomains = fromLines(e.target.value)))} />
              </Field>
            </div>
          </Section>

          {dirty && (
            <div className="save-bar" role="region" aria-label="Unsaved changes">
              <span className="row">
                <span className="led" data-tone="warning" />
                Unsaved changes
              </span>
              <div className="row">
                <button className="btn btn-ghost" onClick={() => setS(JSON.parse(saved) as AppSettings)}>
                  Discard
                </button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  Save settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {confirmNode}
    </div>
  )
}

function Section({ id, title, sub, icon, children }: { id: string; title: string; sub?: string; icon: IconName; children: ReactNode }) {
  return (
    <div id={`settings-${id}`} className="settings-section">
      <Panel title={title} sub={sub} icon={icon}>
        {children}
      </Panel>
    </div>
  )
}

function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
  invalid
}: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
  invalid?: boolean
}) {
  const bad = invalid || Number.isNaN(value) || value < min || (max != null && value > max)
  const input = <input type="number" min={min} max={max} value={Number.isNaN(value) ? '' : value} aria-invalid={bad || undefined} onChange={(e) => onChange(Number(e.target.value))} />
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {suffix ? (
        <span className="input-suffix">
          {input}
          <span>{suffix}</span>
        </span>
      ) : (
        input
      )}
    </label>
  )
}

function TierScale({ t, relevant }: { t: { tier1: number; tier2: number; tier3: number }; relevant: number }) {
  const clamp = (v: number): number => Math.max(0, Math.min(100, v))
  const bands = [
    { from: 0, to: clamp(t.tier3), label: 'Low', color: 'var(--tier-low)' },
    { from: clamp(t.tier3), to: clamp(t.tier2), label: 'Tier 3', color: 'var(--tier3)' },
    { from: clamp(t.tier2), to: clamp(t.tier1), label: 'Tier 2', color: 'var(--tier2)' },
    { from: clamp(t.tier1), to: 100, label: 'Tier 1', color: 'var(--tier1)' }
  ]
  return (
    <div style={{ position: 'relative', paddingTop: 18 }} role="img" aria-label={`Tier 3 from ${t.tier3}, Tier 2 from ${t.tier2}, Tier 1 from ${t.tier1}, relevant from ${relevant}`}>
      <div className="weight-bar" style={{ height: 18 }}>
        {bands.map((b) => (
          <span key={b.label} style={{ flexGrow: Math.max(0, b.to - b.from), background: b.color, opacity: 0.85 }}>
            {b.to - b.from >= 8 ? b.label : ''}
          </span>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 0, left: `${clamp(relevant)}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
        <span className="label-micro" style={{ color: 'var(--accent)' }}>
          REL {relevant}
        </span>
      </div>
      <div style={{ position: 'absolute', top: 14, bottom: -4, left: `${clamp(relevant)}%`, width: 2, background: 'var(--accent)' }} />
      <div className="row-between num faint" style={{ fontSize: 10, marginTop: 4 }}>
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  )
}

function AiConfig({ kind, title, desc, model, onModel }: { kind: AiKind; title: string; desc: string; model: string; onModel: (m: string) => void }) {
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ tone: 'success' | 'critical' | 'neutral'; text: string } | null>(null)
  useEffect(() => {
    void api.settings.hasApiKey(kind).then(setHasKey)
  }, [kind])
  return (
    <div className="ai-card">
      <div className="row-between">
        <div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div className="muted small">{desc}</div>
        </div>
        <StatusBadge tone={hasKey ? 'success' : 'warning'} dot>
          {hasKey ? 'Key stored' : 'No key'}
        </StatusBadge>
      </div>
      <Field label={<><Icon name="key" size={13} /> API key</>}>
        <input type="password" autoComplete="off" placeholder={hasKey ? 'Enter a new key to replace' : 'sk-or-...'} value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      <Field label="Model" hint="Any OpenRouter model id. Save settings after changing.">
        <input className="mono" placeholder="provider/model-name" value={model} onChange={(e) => onModel(e.target.value)} />
      </Field>
      <div className="row wrap">
        <button
          className="btn btn-sm"
          disabled={!key.trim()}
          onClick={async () => {
            try {
              await api.settings.setApiKey(kind, key)
              setKey('')
              setHasKey(true)
              setStatus({ tone: 'success', text: 'Key stored securely' })
            } catch (e) {
              setStatus({ tone: 'critical', text: errorText(e) })
            }
          }}
        >
          <Icon name="key" size={12} /> Save key
        </button>
        <button
          className="btn btn-sm"
          onClick={async () => {
            setStatus({ tone: 'neutral', text: 'Testing...' })
            const r = await api.settings.testConnection(kind).catch((e) => ({ ok: false, message: errorText(e) }))
            setStatus({ tone: r.ok ? 'success' : 'critical', text: r.message })
          }}
        >
          <Icon name="zap" size={12} /> Test connection
        </button>
        {status && (
          <span className={`small ${status.tone === 'success' ? 'tone-success' : status.tone === 'critical' ? 'tone-critical' : 'muted'}`} role="status">
            {status.text}
          </span>
        )}
      </div>
    </div>
  )
}
