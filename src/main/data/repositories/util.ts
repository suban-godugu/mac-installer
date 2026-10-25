import { randomUUID } from 'node:crypto'

export const now = (): string => new Date().toISOString()

export const newId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
