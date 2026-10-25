import type { Db } from '../db'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/config'

const SETTINGS_KEY = 'app_settings'

export class SettingsRepo {
  constructor(private db: Db) {}

  getRaw(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  setRaw(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  }

  deleteRaw(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  /** Stored settings merged over defaults, so new default keys appear after upgrades. */
  get(): AppSettings {
    const raw = this.getRaw(SETTINGS_KEY)
    if (!raw) {
      this.save(DEFAULT_SETTINGS)
      return structuredClone(DEFAULT_SETTINGS)
    }
    const stored = JSON.parse(raw) as Partial<AppSettings>
    const merged = structuredClone(DEFAULT_SETTINGS)
    for (const key of Object.keys(merged) as (keyof AppSettings)[]) {
      if (stored[key]) Object.assign(merged[key], stored[key])
    }
    return merged
  }

  save(settings: AppSettings): void {
    this.setRaw(SETTINGS_KEY, JSON.stringify(settings))
  }

  reset(): AppSettings {
    this.save(DEFAULT_SETTINGS)
    return structuredClone(DEFAULT_SETTINGS)
  }
}
