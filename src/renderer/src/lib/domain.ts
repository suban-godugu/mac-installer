import type { AiState, AuthState } from '@shared/ipc'
import type { CompanyStatus, ProspectRow, TaskStage, TaskStatus, ValidationStatus } from '@shared/schemas'
import type { Tone } from '../design/primitives'

// Renderer imports only types from @shared/schemas (it pulls in zod at runtime).
// Stage/status order comes from these exhaustive, declaration-ordered maps.

export const STAGE_LABELS: Record<TaskStage, string> = {
  INIT: 'Init',
  GOOGLE_AUTH: 'Google auth',
  ZOOMINFO_AUTH: 'ZoomInfo auth',
  OPEN_ADVANCED_SEARCH: 'Open search',
  APPLY_FILTERS: 'Filters',
  RUN_SEARCH: 'Run search',
  COLLECT_COMPANIES: 'Collect',
  PROCESS_COMPANIES: 'Process',
  VALIDATE: 'Validate',
  DEDUP: 'Dedup',
  EXPORT: 'Export',
  DONE: 'Done'
}
export const TASK_STAGES = Object.keys(STAGE_LABELS) as TaskStage[]
export const stageIndex = (s: TaskStage): number => TASK_STAGES.indexOf(s)

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  IDLE: { label: 'Idle', tone: 'neutral' },
  RUNNING: { label: 'Running', tone: 'accent' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  HUMAN_ACTION_REQUIRED: { label: 'Human action required', tone: 'warning' },
  STOPPED: { label: 'Stopped', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'critical' },
  COMPLETED: { label: 'Completed', tone: 'success' }
}

export const COMPANY_STATUS: Record<CompanyStatus, { label: string; tone: Tone; color: string }> = {
  PENDING: { label: 'Pending', tone: 'neutral', color: 'var(--chart-6)' },
  PROCESSING: { label: 'Processing', tone: 'accent', color: 'var(--chart-1)' },
  EMPLOYEES_FOUND: { label: 'Employees found', tone: 'info', color: 'var(--chart-2)' },
  QUALIFIED: { label: 'Qualified', tone: 'info', color: 'var(--chart-4)' },
  COMPLETED: { label: 'Completed', tone: 'success', color: 'var(--success)' },
  FAILED: { label: 'Failed', tone: 'critical', color: 'var(--critical)' },
  NEEDS_HUMAN: { label: 'Needs human', tone: 'warning', color: 'var(--warning)' }
}
export const COMPANY_STATUSES = Object.keys(COMPANY_STATUS) as CompanyStatus[]

export const VALIDATION: Record<ValidationStatus, { label: string; tone: Tone; action: string }> = {
  VALID: { label: 'Valid', tone: 'success', action: 'Record is complete. Ready for export and outreach.' },
  MISSING_EMAIL: { label: 'Missing email', tone: 'warning', action: 'No business email was found. Verify the contact before outreach.' },
  INVALID_EMAIL: { label: 'Invalid email', tone: 'critical', action: 'The email failed format validation. Correct it before outreach.' },
  MISSING_FIELDS: { label: 'Missing fields', tone: 'warning', action: 'Mandatory fields are incomplete. Review the profile in ZoomInfo.' },
  MISSING_SOURCE: { label: 'Missing source', tone: 'warning', action: 'Source URL is missing, so the record cannot be audited. Re-collect if needed.' },
  NOT_QUALIFIED: { label: 'Not qualified', tone: 'neutral', action: 'Scored below the relevance threshold. No action required.' }
}

export function authInfo(s: AuthState): { label: string; tone: Tone } {
  if (s === 'AUTHENTICATED') return { label: 'Authenticated', tone: 'success' }
  if (s === 'NOT_AUTHENTICATED') return { label: 'Signed out', tone: 'warning' }
  return { label: 'Unknown', tone: 'neutral' }
}

export function aiInfo(s: AiState): { label: string; tone: Tone } {
  return (
    {
      CONNECTED: { label: 'Connected', tone: 'success' as Tone },
      CONFIGURED: { label: 'Configured', tone: 'accent' as Tone },
      NOT_CONFIGURED: { label: 'Not configured', tone: 'warning' as Tone },
      ERROR: { label: 'Error', tone: 'critical' as Tone }
    }[s] ?? { label: s, tone: 'neutral' as Tone }
  )
}

export interface ErrorKindInfo {
  label: string
  severity: 'critical' | 'warning' | 'info'
  action: string
}

export function errorKind(kind: string): ErrorKindInfo {
  switch (kind) {
    case 'TASK_FAILED':
      return { label: 'Task failure', severity: 'critical', action: 'The task halted. Inspect the evidence, fix the cause, then use Retry from the dashboard.' }
    case 'COMPANY_FAILED':
      return { label: 'Company failure', severity: 'warning', action: 'This company was skipped after retries. Retry the task to reprocess failed companies.' }
    case 'NAVIGATION_BLOCKED':
      return { label: 'Navigation blocked', severity: 'warning', action: 'A URL was outside the allowed domains. Add the domain in Settings > Pacing if it is legitimate.' }
    case 'NAVIGATION_FAILED':
      return { label: 'Navigation failed', severity: 'warning', action: 'Page load failed. Check network or ZoomInfo availability, then retry.' }
    case 'TAB_LOST':
      return { label: 'Tab lost', severity: 'warning', action: 'A controlled tab was closed. Avoid closing automation tabs while a task is running.' }
    case 'CONTROLLER_ERROR':
      return { label: 'Controller AI error', severity: 'warning', action: 'The controller AI could not reach its goal. Check the page state and the controller model in Settings.' }
    case 'MAX_STEPS':
      return { label: 'Step budget exhausted', severity: 'warning', action: 'The goal needed more steps than allowed. Raise "Max controller steps" in Settings if pages are slow.' }
    case 'STEP_FAILED':
      return { label: 'Step failed', severity: 'info', action: 'A workflow step failed and may have been retried automatically.' }
    default:
      return { label: kind.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), severity: 'info', action: 'Review the message for details.' }
  }
}

export const HUMAN_REASONS: Record<string, { label: string; steps: string }> = {
  CAPTCHA: { label: 'CAPTCHA / human verification', steps: 'Solve the verification challenge in the browser window.' },
  MFA: { label: 'Multi-factor verification', steps: 'Approve the sign-in on your authenticator or enter the code in the browser.' },
  LOGIN_REQUIRED: { label: 'Sign-in required', steps: 'Sign in to ZoomInfo in the browser window. Your password is never seen by the app.' },
  LOGIN_EXPIRED: { label: 'Session expired', steps: 'Sign in again in the browser window.' },
  UNEXPECTED_AUTHENTICATION: { label: 'Unexpected authentication', steps: 'An unexpected login page appeared. Review it and sign in only if it is legitimate.' },
  AMBIGUOUS_STATE: { label: 'Ambiguous browser state', steps: 'Bring the browser back to the expected ZoomInfo page.' },
  UNEXPECTED_PAGE: { label: 'Unexpected page', steps: 'Navigate the browser back to the expected ZoomInfo page.' },
  PERMISSION_ISSUE: { label: 'Permission issue', steps: 'ZoomInfo reports a permission, credit or usage limit. Resolve it in the browser.' },
  RETRIES_EXHAUSTED: { label: 'Retries exhausted', steps: 'Automatic recovery failed. Inspect the browser and fix the page state.' }
}

export const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Low Priority', 'NOT_AVAILABLE'] as const
export const TIER_COLORS: Record<string, string> = {
  'Tier 1': 'var(--tier1)',
  'Tier 2': 'var(--tier2)',
  'Tier 3': 'var(--tier3)',
  'Low Priority': 'var(--tier-low)',
  NOT_AVAILABLE: 'var(--surface-3)'
}
export const tierLabel = (t: string): string => (t === 'NOT_AVAILABLE' ? 'Unscored' : t)

export const COMPONENT_LABELS: { key: keyof NonNullable<ProspectRow['components']>; label: string; short: string }[] = [
  { key: 'ate', label: 'ATE relevance', short: 'ATE' },
  { key: 'semiconductorTesting', label: 'Semiconductor testing', short: 'SEMI TEST' },
  { key: 'role', label: 'Role match', short: 'ROLE' },
  { key: 'department', label: 'Department', short: 'DEPT' },
  { key: 'seniority', label: 'Seniority', short: 'SENIORITY' },
  { key: 'business', label: 'Business fit', short: 'BUSINESS' }
]

export const NA = 'NOT_AVAILABLE'
export const clean = (v: string | null | undefined): string => (!v || v === NA ? '' : v)

export const fmtTime = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour12: false })
export const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
export const pct = (n: number, d: number): number | null => (d > 0 ? n / d : null)
export const fmtPct = (v: number | null, digits = 0): string => (v == null ? '-' : `${(v * 100).toFixed(digits)}`)

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.max(s, 0)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
