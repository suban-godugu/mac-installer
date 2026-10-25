import { join } from 'node:path'
import type { ProspectRow } from '@shared/schemas'
import type { AppSettings } from '@shared/config'
import type { Repos } from '../../data/repositories'
import { validateRows } from '../../data/validation'
import { dedupe } from '../../data/dedup'
import { exportProspects } from '../../data/excelExport'
import { withRetry, errMsg } from '../retry'

export interface FinalizeResult {
  rows: ProspectRow[]
  duplicatesMerged: number
  invalid: number
  path: string
}

/** Validate -> dedupe -> (optionally keep qualified only) -> Excel. Shared by the task and the EXPORT button. */
export async function validateDedupExport(
  repos: Repos,
  taskId: string,
  settings: AppSettings,
  outputDir: string,
  log: (level: 'info' | 'success' | 'warn' | 'error' | 'progress', msg: string) => void
): Promise<FinalizeResult> {
  const validated = validateRows(repos.research.prospects(taskId))
  const invalid = validated.filter((r) => ['MISSING_FIELDS', 'MISSING_SOURCE'].includes(r.validation_status)).length
  log('progress', `Validation: ${validated.length} records checked, ${invalid} with missing required fields`)

  const { rows: unique, duplicatesMerged } = dedupe(validated)
  log('progress', `Deduplication: ${duplicatesMerged} duplicate records merged`)

  const rows = (settings.output.qualifiedOnly ? unique.filter((r) => r.relevant) : unique)
    .filter((r) => !['MISSING_FIELDS', 'MISSING_SOURCE'].includes(r.validation_status))
    .sort((a, b) => (b.relevance_score ?? -1) - (a.relevance_score ?? -1))

  const task = repos.tasks.get(taskId)
  const safeName = (task?.name ?? 'prospects').replace(/[^\w.-]+/g, '_').slice(0, 60)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const path = join(settings.output.outputDir || outputDir, `${safeName}_${stamp}.xlsx`)

  try {
    await withRetry(() => exportProspects(rows, { path, auditColumns: settings.output.auditColumns }), {
      attempts: 3,
      baseDelayMs: 1000,
      onRetry: (a, e) => log('warn', `Excel export attempt ${a} failed: ${errMsg(e)}`)
    })
  } catch (err) {
    repos.tasks.addExport(taskId, path, 0, 'FAILED', errMsg(err))
    throw err
  }
  repos.tasks.addExport(taskId, path, rows.length, 'OK', `${duplicatesMerged} duplicates merged`)
  log('success', `Excel generated: ${rows.length} rows -> ${path}`)
  return { rows, duplicatesMerged, invalid, path }
}
