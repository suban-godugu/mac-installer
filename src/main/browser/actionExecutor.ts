import type { Page } from 'playwright-core'
import type { BrowserAction, TabPurpose } from '@shared/schemas'
import type { BrowserSessionManager } from './sessionManager'
import { RateLimiter } from './rateLimiter'
import type { RuntimeConfig } from '@shared/config'

export interface ActionOutcome {
  ok: boolean
  message: string
  tabId: string
}

const sel = (id: string): string => `[data-vpib-id="${id.replace(/"/g, '')}"]`

export class ActionExecutor {
  private actions: RateLimiter
  private pageOpens: RateLimiter

  constructor(
    private session: BrowserSessionManager,
    runtime: () => RuntimeConfig
  ) {
    this.actions = new RateLimiter(
      () => runtime().actionsPerMinute,
      () => runtime().minActionDelayMs
    )
    this.pageOpens = new RateLimiter(() => runtime().pageOpensPerMinute)
  }

  /** Only call with actions that passed validateAction. */
  async execute(action: BrowserAction, tabId: string, purposeForNewTab: TabPurpose = 'research'): Promise<ActionOutcome> {
    const entry = this.session.tabs.get(tabId)
    if (!entry && !['open_tab', 'switch_tab'].includes(action.action)) {
      return { ok: false, message: `Tab ${tabId} is gone`, tabId }
    }
    const page = entry?.page as Page
    await this.actions.acquire()

    try {
      switch (action.action) {
        case 'navigate':
          await this.pageOpens.acquire()
          await page.goto(action.target, { waitUntil: 'domcontentloaded', timeout: 45000 })
          await settle(page)
          return { ok: true, message: `Navigated to ${action.target}`, tabId }

        case 'open_tab': {
          await this.pageOpens.acquire()
          const opened = await this.session.openTab(purposeForNewTab, entry?.record.company_id ?? null)
          await opened.page.goto(action.target, { waitUntil: 'domcontentloaded', timeout: 45000 })
          await settle(opened.page)
          return { ok: true, message: `Opened ${action.target} in ${opened.tabId}`, tabId: opened.tabId }
        }

        case 'switch_tab': {
          const target = this.session.tabs.get(action.tab_id!)
          if (!target) return { ok: false, message: `Unknown tab ${action.tab_id}`, tabId }
          this.session.tabs.setActive(action.tab_id!)
          await target.page.bringToFront().catch(() => undefined)
          return { ok: true, message: `Switched to ${action.tab_id}`, tabId: action.tab_id! }
        }

        case 'close_tab':
          await this.session.closeTab(action.tab_id!)
          return { ok: true, message: `Closed ${action.tab_id}`, tabId: action.tab_id === tabId ? '' : tabId }

        case 'click': {
          const loc = page.locator(sel(action.target)).first()
          const popup = page.context().waitForEvent('page', { timeout: 1500 }).catch(() => null)
          await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined)
          await loc.click({ timeout: 10000 })
          const newPage = await popup
          if (newPage) {
            const rec = this.session.tabs.register(newPage, purposeForNewTab, entry!.record.company_id)
            this.session.tabs.setActive(rec.tab_id)
            await settle(newPage)
            return { ok: true, message: `Clicked ${action.target}; opened ${rec.tab_id}`, tabId: rec.tab_id }
          }
          await settle(page)
          return { ok: true, message: `Clicked ${action.target}`, tabId }
        }

        case 'type': {
          const loc = page.locator(sel(action.target)).first()
          await loc.fill(action.value ?? '', { timeout: 10000 }).catch(async () => {
            await loc.click({ timeout: 5000 })
            await page.keyboard.type(action.value ?? '', { delay: 30 })
          })
          await page.waitForTimeout(600)
          return { ok: true, message: `Typed into ${action.target}`, tabId }
        }

        case 'select': {
          const loc = page.locator(sel(action.target)).first()
          const tag = await loc.evaluate((el) => el.tagName.toLowerCase())
          if (tag === 'select') {
            await loc.selectOption({ label: action.value! }, { timeout: 10000 }).catch(() => loc.selectOption(action.value!, { timeout: 10000 }))
          } else {
            await loc.click({ timeout: 10000 })
            await page.getByRole('option', { name: action.value!, exact: false }).first().click({ timeout: 10000 })
          }
          await settle(page)
          return { ok: true, message: `Selected "${action.value}"`, tabId }
        }

        case 'scroll': {
          if (['up', 'down', 'page', 'top', 'bottom', ''].includes(action.target)) {
            const dy = action.target === 'up' ? -800 : action.target === 'top' ? -100000 : action.target === 'bottom' ? 100000 : 800
            await page.mouse.wheel(0, dy)
          } else {
            await page.locator(sel(action.target)).first().scrollIntoViewIfNeeded({ timeout: 5000 })
          }
          await page.waitForTimeout(500)
          return { ok: true, message: `Scrolled ${action.target || 'down'}`, tabId }
        }

        case 'wait':
          await page.waitForTimeout(Number(action.value ?? 1000))
          return { ok: true, message: `Waited ${action.value} ms`, tabId }

        default:
          return { ok: true, message: `No browser effect for ${action.action}`, tabId }
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message.split('\n')[0] : String(err), tabId }
    }
  }
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined)
}
