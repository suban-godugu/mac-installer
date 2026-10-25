import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import type { ProfilesRepo, ProfileRow } from '../data/repositories/profiles'
import type { TabPurpose } from '@shared/schemas'
import { TabRegistry } from './tabRegistry'
import { log } from '../logger'

export interface LaunchOverrides {
  headless?: boolean
  channel?: string
  executablePath?: string
}

/**
 * Owns persistent Chrome profiles and the single live browser context.
 * Authentication happens by the user directly inside this browser window.
 */
export class BrowserSessionManager {
  private context: BrowserContext | null = null
  private profile: ProfileRow | null = null
  readonly tabs = new TabRegistry()
  onStateChange: () => void = () => {}

  constructor(
    private profiles: ProfilesRepo,
    private profilesRoot: string,
    private overrides: LaunchOverrides = {}
  ) {
    mkdirSync(profilesRoot, { recursive: true })
  }

  listProfiles(): ProfileRow[] {
    return this.profiles.list()
  }

  createProfile(name: string): ProfileRow {
    const row = this.profiles.create(name.trim() || 'Default', (id) => join(this.profilesRoot, id))
    mkdirSync(row.dir, { recursive: true })
    return row
  }

  renameProfile(id: string, name: string): void {
    this.profiles.rename(id, name.trim())
  }

  async deleteProfile(id: string): Promise<void> {
    if (this.profile?.id === id) await this.stop()
    const row = this.profiles.get(id)
    this.profiles.remove(id)
    if (row) rmSync(row.dir, { recursive: true, force: true })
  }

  isRunning(): boolean {
    return this.context !== null
  }

  currentProfileId(): string | null {
    return this.profile?.id ?? null
  }

  async start(profileId: string): Promise<void> {
    if (this.context && this.profile?.id === profileId) return
    if (this.context) await this.stop()
    const profile = this.profiles.get(profileId)
    if (!profile) throw new Error(`Profile ${profileId} not found`)
    mkdirSync(profile.dir, { recursive: true })

    const context = await chromium.launchPersistentContext(profile.dir, {
      channel: this.overrides.executablePath ? undefined : (this.overrides.channel ?? 'chrome'),
      executablePath: this.overrides.executablePath,
      headless: this.overrides.headless ?? false,
      chromiumSandbox: true,
      viewport: null,
      args: ['--start-maximized']
    })
    this.context = context
    this.profile = profile
    this.profiles.touch(profileId)

    context.on('page', (page) => {
      if (!this.tabs.findByPage(page)) this.tabs.register(page, 'research')
      void page
        .waitForLoadState('domcontentloaded')
        .then(() => this.tabs.onNavigate(page))
        .catch(() => undefined)
    })
    context.on('close', () => {
      log().warn('browser context closed')
      this.context = null
      this.tabs.clear()
      this.onStateChange()
    })
    context.pages().forEach((page, i) => {
      this.tabs.register(page, i === 0 ? 'search' : 'research')
      this.tabs.onNavigate(page)
    })
    const first = this.tabs.list()[0]
    if (first) this.tabs.setActive(first.tab_id)
    this.onStateChange()
  }

  async stop(): Promise<void> {
    const ctx = this.context
    this.context = null
    this.tabs.clear()
    if (ctx) await ctx.close().catch(() => undefined)
    this.onStateChange()
  }

  requireContext(): BrowserContext {
    if (!this.context) throw new BrowserCrashedError('Browser is not running')
    return this.context
  }

  /** Returns an existing tab for the purpose/company or opens a new one. */
  async tabFor(purpose: TabPurpose, companyId: string | null = null): Promise<{ tabId: string; page: Page }> {
    const existing = this.tabs.byPurpose(purpose, companyId)
    if (existing && !existing.page.isClosed()) {
      this.tabs.setActive(existing.record.tab_id)
      return { tabId: existing.record.tab_id, page: existing.page }
    }
    return this.openTab(purpose, companyId)
  }

  async openTab(purpose: TabPurpose, companyId: string | null = null): Promise<{ tabId: string; page: Page }> {
    const ctx = this.requireContext()
    const blank = this.tabs.list().find((t) => t.url === 'about:blank' && t.purpose !== 'company')
    let page: Page
    let tabId: string
    if (blank) {
      const entry = this.tabs.get(blank.tab_id)!
      page = entry.page
      tabId = this.tabs.register(page, purpose, companyId).tab_id
    } else {
      page = await ctx.newPage()
      tabId = this.tabs.register(page, purpose, companyId).tab_id
    }
    this.tabs.setActive(tabId)
    return { tabId, page }
  }

  async closeTab(tabId: string): Promise<void> {
    const entry = this.tabs.get(tabId)
    if (!entry) return
    if (this.tabs.list().length <= 1) {
      await entry.page.goto('about:blank').catch(() => undefined)
      this.tabs.register(entry.page, 'research')
      return
    }
    await entry.page.close().catch(() => undefined)
  }

  async bringToFront(tabId?: string): Promise<void> {
    const entry = tabId ? this.tabs.get(tabId) : this.tabs.active()
    await entry?.page.bringToFront().catch(() => undefined)
  }
}

export class BrowserCrashedError extends Error {}
