import type { Db } from '../db'
import type { ProfileInfo } from '@shared/ipc'
import { newId, now } from './util'

export interface ProfileRow extends ProfileInfo {
  dir: string
}

export class ProfilesRepo {
  constructor(private db: Db) {}

  list(): ProfileRow[] {
    return this.db.prepare('SELECT * FROM profiles ORDER BY created_at').all() as unknown as ProfileRow[]
  }

  get(id: string): ProfileRow | undefined {
    return this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as unknown as ProfileRow | undefined
  }

  create(name: string, dirFor: (id: string) => string): ProfileRow {
    const id = newId('prof')
    const row: ProfileRow = { id, name, dir: dirFor(id), created_at: now(), last_used_at: null }
    this.db
      .prepare('INSERT INTO profiles (id, name, dir, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)')
      .run(row.id, row.name, row.dir, row.created_at, null)
    return row
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id)
  }

  touch(id: string): void {
    this.db.prepare('UPDATE profiles SET last_used_at = ? WHERE id = ?').run(now(), id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  }
}
