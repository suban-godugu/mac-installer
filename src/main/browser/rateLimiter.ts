import { sleep } from '../agents/openrouterClient'

/** Sliding-window limiter: callers wait until a slot is free instead of being rejected. */
export class RateLimiter {
  private stamps: number[] = []
  private last = 0

  constructor(
    private perMinute: () => number,
    private minGapMs: () => number = () => 0,
    private clock: () => number = Date.now
  ) {}

  delayNeeded(): number {
    const now = this.clock()
    this.stamps = this.stamps.filter((t) => now - t < 60000)
    let wait = Math.max(0, this.last + this.minGapMs() - now)
    const limit = Math.max(1, this.perMinute())
    if (this.stamps.length >= limit) wait = Math.max(wait, this.stamps[0] + 60000 - now)
    return wait
  }

  async acquire(): Promise<void> {
    let wait = this.delayNeeded()
    while (wait > 0) {
      await sleep(wait)
      wait = this.delayNeeded()
    }
    this.last = this.clock()
    this.stamps.push(this.last)
  }
}
