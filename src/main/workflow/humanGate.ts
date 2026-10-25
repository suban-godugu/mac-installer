import type { HumanReason } from '@shared/schemas'
import { sleep } from '../agents/openrouterClient'
import { StopSignal } from './retry'

export interface HumanRequest {
  reason: HumanReason
  message: string
}

/**
 * Blocks the workflow until the human has resolved the situation in the browser.
 * Resolution is confirmed by `verify` (e.g. login detected) - either automatically by polling
 * or when the user presses Resume. Nothing here interacts with the challenge itself.
 */
export class HumanGate {
  private current: HumanRequest | null = null
  private resumeRequested = false

  constructor(
    private isStopped: () => boolean,
    private pollMs = 4000
  ) {}

  pending(): HumanRequest | null {
    return this.current
  }

  requestResume(): void {
    this.resumeRequested = true
  }

  async wait(req: HumanRequest, verify: (userAsked: boolean) => Promise<boolean>, onStillBlocked?: () => void): Promise<void> {
    this.current = req
    this.resumeRequested = false
    try {
      for (;;) {
        if (this.isStopped()) throw new StopSignal()
        const userAsked = this.resumeRequested
        this.resumeRequested = false
        let ok = false
        try {
          ok = await verify(userAsked)
        } catch {
          ok = false
        }
        if (ok) return
        if (userAsked) onStillBlocked?.()
        const until = Date.now() + this.pollMs
        while (Date.now() < until && !this.resumeRequested && !this.isStopped()) await sleep(250)
      }
    } finally {
      this.current = null
    }
  }
}
