import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Minimal .env reader (KEY=VALUE lines). Values already present in process.env win. */
export function loadDotEnv(dirs: string[]): void {
  for (const dir of dirs) {
    const file = join(dir, '.env')
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line)
      if (!m || line.trim().startsWith('#')) continue
      const value = m[2].replace(/^["']|["']$/g, '')
      if (value && process.env[m[1]] === undefined) process.env[m[1]] = value
    }
    return
  }
}
