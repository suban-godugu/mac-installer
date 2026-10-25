import searchDefaults from '../../config/defaults/search.json'
import rolesDefaults from '../../config/defaults/roles.json'
import scoringDefaults from '../../config/defaults/scoring.json'
import outputDefaults from '../../config/defaults/output.json'
import runtimeDefaults from '../../config/defaults/runtime.json'

export const APP_NAME = 'Verilumen Prospect Intelligence Browser'
export const APP_ID = 'verilumen-prospect-browser'

export const NOT_AVAILABLE = 'NOT_AVAILABLE'

export const MANDATORY_COLUMNS = [
  'Company Name',
  'Employee Name',
  'Employee Role',
  'Employee Business Email'
] as const

export interface SearchConfig {
  name: string
  zoominfoStartUrl: string
  industry: string[]
  naics: string[]
  maxCompanies: number
  maxEmployeesPerCompany: number
  requireGoogleAuth: boolean
}

export interface RolesConfig {
  targetCompany: string
  targetBusiness: string[]
  highPriority: string[]
  secondPriority: string[]
  lowPriority: string[]
}

export interface ScoringWeights {
  role: number
  department: number
  ate: number
  semiconductorTesting: number
  seniority: number
  business: number
}

export interface ScoringConfig {
  weights: ScoringWeights
  tiers: { tier1: number; tier2: number; tier3: number }
  relevantMinScore: number
}

export interface OutputConfig {
  outputDir: string
  qualifiedOnly: boolean
  auditColumns: string[]
}

export interface RuntimeConfig {
  allowedDomains: string[]
  actionsPerMinute: number
  pageOpensPerMinute: number
  minActionDelayMs: number
  maxControllerSteps: number
  retryAttempts: number
  retryBaseDelayMs: number
  aiTimeoutMs: number
  researchBatchSize: number
}

export interface AiModelConfig {
  controllerModel: string
  researchModel: string
}

export interface AppSettings {
  search: SearchConfig
  roles: RolesConfig
  scoring: ScoringConfig
  output: OutputConfig
  runtime: RuntimeConfig
  ai: AiModelConfig
}

export const DEFAULT_SETTINGS: AppSettings = {
  search: searchDefaults,
  roles: rolesDefaults,
  scoring: scoringDefaults,
  output: outputDefaults,
  runtime: runtimeDefaults,
  ai: { controllerModel: '', researchModel: '' }
}
