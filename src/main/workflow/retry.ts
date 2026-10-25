import { sleep } from '../agents/openrouterClient'

export class StopSignal extends Error {
  constructor() {
    super('Task stopped')
  }
}

export class StepError extends Error {
  constructor(
    message: string,
    public readonly kind: string = 'STEP_FAILED'
  ) {
    super(message)
  }
}

export interface RetryOptions {
  attempts: number
  baseDelayMs: number
  onRetry?: (attempt: number, err: unknown) => void
  /** Errors for which retrying is pointless (stop requests, etc.). */
  isFatal?: (err: unknown) => boolean
}

/** Bounded retry with exponential backoff. Never retries forever. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= Math.max(1, opts.attempts); attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      if (err instanceof StopSignal || opts.isFatal?.(err)) throw err
      if (attempt < opts.attempts) {
        opts.onRetry?.(attempt, err)
        await sleep(opts.baseDelayMs * 2 ** (attempt - 1))
      }
    }
  }
  throw lastErr
}

export const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 500)
