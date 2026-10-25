import type { AppSettings } from '@shared/config'
import type { CompanyRecord, ProspectRow } from '@shared/schemas'
import { api, useLoader } from '../hooks'

const running = (s: string | undefined): boolean => s === 'RUNNING' || s === 'HUMAN_ACTION_REQUIRED'

export function useProspects(taskId: string | null, qualifiedOnly: boolean, taskStatus?: string): [ProspectRow[] | null, () => void, string | null] {
  return useLoader<ProspectRow[]>(() => (taskId ? api.data.prospects(taskId, qualifiedOnly) : Promise.resolve([])), [taskId, qualifiedOnly], running(taskStatus) ? 8000 : 30000)
}

export function useCompanies(taskId: string | null, taskStatus?: string): [CompanyRecord[] | null, () => void, string | null] {
  return useLoader<CompanyRecord[]>(() => (taskId ? api.data.companies(taskId) : Promise.resolve([])), [taskId], running(taskStatus) ? 5000 : 30000)
}

export function useSettings(): [AppSettings | null, () => void, string | null] {
  return useLoader<AppSettings>(() => api.settings.get(), [])
}

const handoff = new Map<string, string>()
/** Pass a selection to the next page (e.g. open a prospect in the inspector). */
export const setHandoff = (key: string, id: string): void => void handoff.set(key, id)
export const takeHandoff = (key: string): string | null => {
  const v = handoff.get(key) ?? null
  handoff.delete(key)
  return v
}
