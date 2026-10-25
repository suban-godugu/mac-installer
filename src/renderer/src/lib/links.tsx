import type { ReactNode } from 'react'
import { Icon } from '../design/Icon'
import { clean } from './domain'

/** Normalizes a stored URL/domain to https (the main process only opens https externally). */
export const httpsUrl = (v: string): string | null => {
  const s = clean(v).trim()
  if (!s) return null
  if (/^https:\/\//i.test(s)) return s
  if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:')
  return /^[\w.-]+\.[a-z]{2,}/i.test(s) ? `https://${s}` : null
}

export function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
      <span className="truncate">{children}</span>
      <Icon name="external" size={11} />
      <span className="sr-only">(opens in browser)</span>
    </a>
  )
}
