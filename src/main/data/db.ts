import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './migrations'

export type Db = DatabaseSync

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
  let version = row?.version ?? 0
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run()
  while (version < MIGRATIONS.length) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version])
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1)
    })
    version++
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
