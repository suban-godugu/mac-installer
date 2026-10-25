import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import pino, { type Logger } from 'pino'

let logger: Logger = pino({ level: process.env.VPIB_LOG_LEVEL ?? 'silent' })

export function initLogger(dir: string): Logger {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `app-${new Date().toISOString().slice(0, 10)}.jsonl`)
  logger = pino(
    { level: process.env.VPIB_LOG_LEVEL ?? 'info', base: { app: 'vpib' } },
    pino.destination({ dest: file, sync: false, mkdir: true })
  )
  return logger
}

export function log(): Logger {
  return logger
}
