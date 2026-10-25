import { z } from 'zod'

export const ACTION_TYPES = [
  'navigate',
  'click',
  'type',
  'select',
  'scroll',
  'open_tab',
  'switch_tab',
  'close_tab',
  'wait',
  'extract',
  'pause_for_human',
  'resume',
  'complete',
  'error'
] as const

export const BrowserActionSchema = z.object({
  action: z.enum(ACTION_TYPES),
  target: z.string().max(2000).optional().default(''),
  value: z.string().max(500).optional(),
  tab_id: z.string().max(64).optional(),
  reason: z.string().max(500).optional().default('')
})
export type BrowserAction = z.infer<typeof BrowserActionSchema>

export const TAB_PURPOSES = [
  'search',
  'company',
  'technology',
  'organization',
  'employees',
  'employee_profile',
  'research',
  'human_intervention',
  'auth'
] as const
export type TabPurpose = (typeof TAB_PURPOSES)[number]

export interface TabRecord {
  tab_id: string
  purpose: TabPurpose
  url: string
  company_id: string | null
  status: 'active' | 'idle' | 'closed'
}

export const COMPANY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'EMPLOYEES_FOUND',
  'QUALIFIED',
  'COMPLETED',
  'FAILED',
  'NEEDS_HUMAN'
] as const
export type CompanyStatus = (typeof COMPANY_STATUSES)[number]

export interface CompanyRecord {
  id: string
  task_id: string
  zoominfo_id: string
  name: string
  website: string
  domain: string
  industry: string
  naics: string
  location: string
  employee_count: string
  technology: string
  description: string
  profile_url: string
  source: string
  status: CompanyStatus
  idx: number
  attempts: number
  error: string
}

export interface EmployeeRecord {
  id: string
  task_id: string
  company_id: string
  zoominfo_id: string
  name: string
  role: string
  department: string
  seniority: string
  email: string
  location: string
  profile_url: string
  source: string
  collected_at: string
}

export const TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Low Priority'] as const
export type Tier = (typeof TIERS)[number]

export const ScoreComponentsSchema = z.object({
  role: z.number().min(0).max(1),
  department: z.number().min(0).max(1),
  ate: z.number().min(0).max(1),
  semiconductorTesting: z.number().min(0).max(1),
  seniority: z.number().min(0).max(1),
  business: z.number().min(0).max(1)
})
export type ScoreComponents = z.infer<typeof ScoreComponentsSchema>

export const ResearchEvaluationSchema = z.object({
  employee_ref: z.string(),
  relevant: z.boolean(),
  components: ScoreComponentsSchema,
  relevance_score: z.number().optional(),
  priority: z.string().optional(),
  reason: z.string().max(600)
})
export const ResearchResponseSchema = z.object({
  evaluations: z.array(ResearchEvaluationSchema)
})
export type ResearchEvaluation = z.infer<typeof ResearchEvaluationSchema>

export interface EvaluationRecord {
  employee_id: string
  task_id: string
  relevant: boolean
  relevance_score: number
  priority: Tier
  reason: string
  components: ScoreComponents
}

export const VALIDATION_STATUSES = [
  'VALID',
  'MISSING_EMAIL',
  'INVALID_EMAIL',
  'MISSING_FIELDS',
  'MISSING_SOURCE',
  'NOT_QUALIFIED'
] as const
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number]

export interface ProspectRow {
  employee_id: string
  zoominfo_id: string
  company_name: string
  company_domain: string
  company_naics: string
  company_location: string
  employee_name: string
  employee_role: string
  employee_email: string
  department: string
  profile_url: string
  priority: Tier | 'NOT_AVAILABLE'
  relevance_score: number | null
  reason: string
  relevant: boolean
  source: string
  collected_at: string
  validation_status: ValidationStatus
  validation_notes: string[]
  components?: ScoreComponents | null
}

export const TASK_STAGES = [
  'INIT',
  'GOOGLE_AUTH',
  'ZOOMINFO_AUTH',
  'OPEN_ADVANCED_SEARCH',
  'APPLY_FILTERS',
  'RUN_SEARCH',
  'COLLECT_COMPANIES',
  'PROCESS_COMPANIES',
  'VALIDATE',
  'DEDUP',
  'EXPORT',
  'DONE'
] as const
export type TaskStage = (typeof TASK_STAGES)[number]

export const TASK_STATUSES = [
  'IDLE',
  'RUNNING',
  'PAUSED',
  'HUMAN_ACTION_REQUIRED',
  'STOPPED',
  'FAILED',
  'COMPLETED'
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const HUMAN_REASONS = [
  'CAPTCHA',
  'MFA',
  'LOGIN_REQUIRED',
  'LOGIN_EXPIRED',
  'UNEXPECTED_AUTHENTICATION',
  'AMBIGUOUS_STATE',
  'UNEXPECTED_PAGE',
  'PERMISSION_ISSUE',
  'RETRIES_EXHAUSTED'
] as const
export type HumanReason = (typeof HUMAN_REASONS)[number]

export interface Checkpoint {
  task_id: string
  stage: TaskStage
  company_index: number
  current_company_id: string | null
  current_tab_id: string | null
  current_url: string
  search: unknown
  results_url: string
  results_page: number
  human: { reason: HumanReason; message: string } | null
  updated_at: string
}
