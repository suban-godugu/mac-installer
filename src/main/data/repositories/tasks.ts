import type { Db } from '../db'
import type { AppSettings } from '@shared/config'
import type { Checkpoint, TabRecord, TaskStage, TaskStatus } from '@shared/schemas'
import type { ActivityEvent, ErrorEntry, TaskSummary } from '@shared/ipc'
import { newId, now } from './util'

export interface TaskRow extends TaskSummary {
  profile_id: string | null
  settings_json: string
}

export class TasksRepo {
  constructor(private db: Db) {}

  create(name: string, profileId: string | null, settings: AppSettings): TaskRow {
    const ts = now()
    const row: TaskRow = {
      id: newId('task'),
      name,
      status: 'IDLE',
      stage: 'INIT',
      profile_id: profileId,
      settings_json: JSON.stringify(settings),
      created_at: ts,
      updated_at: ts
    }
    this.db
      .prepare(
        'INSERT INTO tasks (id, name, status, stage, profile_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(row.id, row.name, row.status, row.stage, row.profile_id, row.settings_json, ts, ts)
    return row
  }

  get(id: string): TaskRow | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as TaskRow | undefined
  }

  list(): TaskSummary[] {
    return this.db
      .prepare('SELECT id, name, status, stage, created_at, updated_at FROM tasks ORDER BY created_at DESC')
      .all() as unknown as TaskSummary[]
  }

  latestUnfinished(): TaskRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE status NOT IN ('COMPLETED', 'STOPPED') ORDER BY updated_at DESC LIMIT 1"
      )
      .get() as unknown as TaskRow | undefined
  }

  setStatus(id: string, status: TaskStatus): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
  }

  setStage(id: string, stage: TaskStage): void {
    this.db.prepare('UPDATE tasks SET stage = ?, updated_at = ? WHERE id = ?').run(stage, now(), id)
  }

  saveCheckpoint(cp: Checkpoint): void {
    cp.updated_at = now()
    this.db
      .prepare(
        'INSERT INTO checkpoints (task_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
      )
      .run(cp.task_id, JSON.stringify(cp), cp.updated_at)
  }

  getCheckpoint(taskId: string): Checkpoint | undefined {
    const row = this.db.prepare('SELECT data FROM checkpoints WHERE task_id = ?').get(taskId) as
      | { data: string }
      | undefined
    return row ? (JSON.parse(row.data) as Checkpoint) : undefined
  }

  saveTabs(taskId: string, tabs: TabRecord[]): void {
    const ts = now()
    this.db.prepare('DELETE FROM tabs WHERE task_id = ?').run(taskId)
    const stmt = this.db.prepare(
      'INSERT INTO tabs (tab_id, task_id, purpose, url, company_id, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    for (const t of tabs) stmt.run(t.tab_id, taskId, t.purpose, t.url, t.company_id, t.status, ts)
  }

  getTabs(taskId: string): TabRecord[] {
    return this.db
      .prepare('SELECT tab_id, purpose, url, company_id, status FROM tabs WHERE task_id = ?')
      .all(taskId) as unknown as TabRecord[]
  }

  addActivity(taskId: string | null, level: ActivityEvent['level'], message: string): ActivityEvent {
    const ts = now()
    const res = this.db
      .prepare('INSERT INTO activity_log (task_id, ts, level, message) VALUES (?, ?, ?, ?)')
      .run(taskId, ts, level, message)
    return { id: Number(res.lastInsertRowid), task_id: taskId, ts, level, message }
  }

  activity(taskId: string | null, limit: number): ActivityEvent[] {
    const rows = taskId
      ? this.db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY id DESC LIMIT ?').all(taskId, limit)
      : this.db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit)
    return (rows as unknown as ActivityEvent[]).reverse()
  }

  addError(taskId: string, stage: string, companyId: string | null, kind: string, message: string): void {
    this.db
      .prepare('INSERT INTO errors (task_id, ts, stage, company_id, kind, message) VALUES (?, ?, ?, ?, ?, ?)')
      .run(taskId, now(), stage, companyId, kind, message.slice(0, 2000))
  }

  errors(taskId: string): ErrorEntry[] {
    return this.db
      .prepare('SELECT * FROM errors WHERE task_id = ? ORDER BY id DESC')
      .all(taskId) as unknown as ErrorEntry[]
  }

  addExport(taskId: string, path: string, rows: number, status: 'OK' | 'FAILED', message: string): void {
    this.db
      .prepare('INSERT INTO exports (task_id, ts, path, rows, status, message) VALUES (?, ?, ?, ?, ?, ?)')
      .run(taskId, now(), path, rows, status, message)
  }

  lastExport(taskId: string): { path: string; status: string } | undefined {
    return this.db
      .prepare('SELECT path, status FROM exports WHERE task_id = ? ORDER BY id DESC LIMIT 1')
      .get(taskId) as unknown as { path: string; status: string } | undefined
  }
}
