import type { Page } from 'playwright-core'
import type { TabPurpose, TabRecord } from '@shared/schemas'

interface Entry {
  record: TabRecord
  page: Page
}

/** Tracks every browser tab with its purpose and owning company. */
export class TabRegistry {
  private entries = new Map<string, Entry>()
  private counter = 0
  private activeId: string | null = null
  onChange: (tabs: TabRecord[]) => void = () => {}
  onNavigate: (page: Page) => void = () => {}

  register(page: Page, purpose: TabPurpose, companyId: string | null = null): TabRecord {
    const existing = this.findByPage(page)
    if (existing) {
      existing.record.purpose = purpose
      existing.record.company_id = companyId
      this.emit()
      return existing.record
    }
    const tab_id = `tab_${String(++this.counter).padStart(3, '0')}`
    const record: TabRecord = { tab_id, purpose, url: safeUrl(page), company_id: companyId, status: 'idle' }
    this.entries.set(tab_id, { record, page })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        record.url = frame.url()
        this.emit()
        this.onNavigate(page)
      }
    })
    page.on('close', () => {
      record.status = 'closed'
      this.entries.delete(tab_id)
      if (this.activeId === tab_id) this.activeId = null
      this.emit()
    })
    this.emit()
    return record
  }

  setActive(tabId: string): void {
    for (const e of this.entries.values()) e.record.status = e.record.tab_id === tabId ? 'active' : 'idle'
    this.activeId = tabId
    this.emit()
  }

  active(): Entry | undefined {
    return this.activeId ? this.entries.get(this.activeId) : undefined
  }

  get(tabId: string): Entry | undefined {
    return this.entries.get(tabId)
  }

  findByPage(page: Page): Entry | undefined {
    for (const e of this.entries.values()) if (e.page === page) return e
    return undefined
  }

  byPurpose(purpose: TabPurpose, companyId?: string | null): Entry | undefined {
    for (const e of this.entries.values()) {
      if (e.record.purpose === purpose && (companyId === undefined || e.record.company_id === companyId)) return e
    }
    return undefined
  }

  list(): TabRecord[] {
    return [...this.entries.values()].map((e) => ({ ...e.record }))
  }

  clear(): void {
    this.entries.clear()
    this.activeId = null
    this.emit()
  }

  private emit(): void {
    this.onChange(this.list())
  }
}

function safeUrl(page: Page): string {
  try {
    return page.url()
  } catch {
    return ''
  }
}
