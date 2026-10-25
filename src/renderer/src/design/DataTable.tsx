import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'
import { EmptyState, ErrorState, LoadingState } from './states'

export interface Column<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  /** Plain value used for sorting, searching and mobile cards. */
  value?: (row: T) => string | number | null
  width?: number
  numeric?: boolean
  primary?: boolean
  wrap?: boolean
  sortable?: boolean
  hideOnCard?: boolean
}

type SortDir = 'ascending' | 'descending'
const ROW_H = 36
const VIRTUALIZE_AT = 200
const OVERSCAN = 12
const CARD_PAGE = 60

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  emptyDesc,
  loading,
  error,
  onRetry,
  toolbar,
  selectedKey,
  onSelect,
  renderDetail,
  searchPlaceholder = 'Search',
  maxHeight = 'calc(100vh - 300px)',
  defaultSort,
  label
}: {
  rows: T[] | null
  columns: Column<T>[]
  rowKey: (row: T) => string
  empty: string
  emptyDesc?: ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  toolbar?: ReactNode
  selectedKey?: string | null
  onSelect?: (row: T) => void
  renderDetail?: (row: T) => ReactNode
  searchPlaceholder?: string
  maxHeight?: string | number
  defaultSort?: { key: string; dir: SortDir }
  label: string
}) {
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim().toLowerCase())
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(defaultSort ?? null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [cardLimit, setCardLimit] = useState(CARD_PAGE)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ top: 0, h: 600 })

  const valueOf = useCallback((c: Column<T>, r: T): string | number | null => {
    if (c.value) return c.value(r)
    const v = c.render(r)
    return typeof v === 'string' || typeof v === 'number' ? v : null
  }, [])

  const filtered = useMemo(() => {
    let out = rows ?? []
    if (q) out = out.filter((r) => columns.some((c) => String(valueOf(c, r) ?? '').toLowerCase().includes(q)))
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      if (col) {
        const mul = sort.dir === 'ascending' ? 1 : -1
        out = [...out].sort((a, b) => {
          const va = valueOf(col, a)
          const vb = valueOf(col, b)
          if (va == null || va === '') return 1
          if (vb == null || vb === '') return -1
          return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * mul
        })
      }
    }
    return out
  }, [rows, columns, q, sort, valueOf])

  const virtual = filtered.length > VIRTUALIZE_AT && expanded.size === 0
  const showTable = filtered.length > 0 && !!rows
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => setScroll({ top: el.scrollTop, h: el.clientHeight })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [virtual, showTable])

  const start = virtual ? Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN) : 0
  const end = virtual ? Math.min(filtered.length, Math.ceil((scroll.top + scroll.h) / ROW_H) + OVERSCAN) : filtered.length
  const visible = filtered.slice(start, end)
  const colSpan = columns.length + (renderDetail ? 1 : 0)

  const toggleSort = (key: string): void =>
    setSort((s) => (s?.key !== key ? { key, dir: 'ascending' } : s.dir === 'ascending' ? { key, dir: 'descending' } : null))
  const toggleExpand = (k: string): void =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, r: T, k: string): void => {
    const tr = e.currentTarget
    const move = (dir: 1 | -1): void => {
      let n = (dir === 1 ? tr.nextElementSibling : tr.previousElementSibling) as HTMLElement | null
      while (n && !n.classList.contains('dt-row')) n = (dir === 1 ? n.nextElementSibling : n.previousElementSibling) as HTMLElement | null
      if (n) {
        e.preventDefault()
        n.focus()
      }
    }
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (onSelect) onSelect(r)
      else if (renderDetail) toggleExpand(k)
    } else if (renderDetail && e.key === 'ArrowRight' && !expanded.has(k)) toggleExpand(k)
    else if (renderDetail && e.key === 'ArrowLeft' && expanded.has(k)) toggleExpand(k)
  }

  const body = (): ReactNode => {
    if (error && !rows) return <ErrorState message={error} onRetry={onRetry} />
    if (loading && !rows) return <LoadingState rows={6} />
    if (filtered.length === 0)
      return q ? <EmptyState compact icon="search" title="No matching rows" desc={`Nothing matches "${query}".`} /> : <EmptyState icon="layers" wafer title={empty} desc={emptyDesc} />
    return null
  }
  const state = body()

  return (
    <div className="dt">
      <div className="dt-toolbar">
        <label className="dt-search">
          <Icon name="search" size={14} />
          <span className="sr-only">Search {label}</span>
          <input type="search" placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {toolbar}
        <span className="dt-count" aria-live="polite">
          {filtered.length.toLocaleString()} / {(rows?.length ?? 0).toLocaleString()}
        </span>
      </div>
      {state ?? (
        <>
          <div className="dt-scroll dt-responsive" ref={scrollRef} style={{ maxHeight }}>
            <table className="dt-table" aria-label={label} aria-rowcount={filtered.length}>
              <thead>
                <tr>
                  {renderDetail && (
                    <th style={{ width: 32 }}>
                      <span className="sr-only">Expand</span>
                    </th>
                  )}
                  {columns.map((c) => (
                    <th key={c.key} style={c.width ? { width: c.width } : undefined} aria-sort={sort?.key === c.key ? sort.dir : undefined} className={c.numeric ? 'num' : undefined} scope="col">
                      {c.sortable === false ? (
                        c.label
                      ) : (
                        <button onClick={() => toggleSort(c.key)}>
                          {c.label}
                          <Icon name={sort?.key === c.key ? (sort.dir === 'ascending' ? 'arrowUp' : 'arrowDown') : 'sort'} size={11} style={{ opacity: sort?.key === c.key ? 1 : 0.4 }} />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {virtual && start > 0 && (
                  <tr className="dt-spacer" aria-hidden="true">
                    <td colSpan={colSpan} style={{ height: start * ROW_H }} />
                  </tr>
                )}
                {visible.map((r, i) => {
                  const k = rowKey(r)
                  const open = expanded.has(k)
                  return (
                    <Fragment key={k}>
                      <tr
                        className="dt-row"
                        tabIndex={0}
                        aria-rowindex={start + i + 1}
                        aria-selected={onSelect ? selectedKey === k : undefined}
                        aria-expanded={renderDetail ? open : undefined}
                        data-clickable={onSelect || renderDetail ? 'true' : undefined}
                        onClick={() => (onSelect ? onSelect(r) : renderDetail && toggleExpand(k))}
                        onKeyDown={(e) => onRowKey(e, r, k)}
                      >
                        {renderDetail && (
                          <td className="dt-expander">
                            <button
                              className="expander"
                              aria-expanded={open}
                              aria-label={open ? 'Collapse row' : 'Expand row'}
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(k)
                              }}
                            >
                              <Icon name="chevronRight" size={14} />
                            </button>
                          </td>
                        )}
                        {columns.map((c) => (
                          <td key={c.key} className={[c.primary && 'dt-cell-primary', c.numeric && 'num', c.wrap && 'dt-wrap'].filter(Boolean).join(' ') || undefined} title={typeof valueOf(c, r) === 'string' ? String(valueOf(c, r)) : undefined}>
                            {c.render(r)}
                          </td>
                        ))}
                      </tr>
                      {open && renderDetail && (
                        <tr className="dt-detail">
                          <td colSpan={colSpan}>{renderDetail(r)}</td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {virtual && end < filtered.length && (
                  <tr className="dt-spacer" aria-hidden="true">
                    <td colSpan={colSpan} style={{ height: (filtered.length - end) * ROW_H }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ul className="dt-cards" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered.slice(0, cardLimit).map((r) => {
              const k = rowKey(r)
              const open = expanded.has(k)
              const primary = columns.find((c) => c.primary) ?? columns[0]
              return (
                <li key={k} className="dt-card" aria-selected={onSelect ? selectedKey === k : undefined}>
                  <button className="row-between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => (onSelect ? onSelect(r) : renderDetail && toggleExpand(k))}>
                    <span className="dt-cell-primary">{primary.render(r)}</span>
                    {(onSelect || renderDetail) && <Icon name="chevronRight" size={14} className="faint" />}
                  </button>
                  {columns
                    .filter((c) => c !== primary && !c.hideOnCard)
                    .map((c) => (
                      <div key={c.key} className="dt-card-row">
                        <span>{c.label}</span>
                        <span>{c.render(r)}</span>
                      </div>
                    ))}
                  {open && renderDetail && <div style={{ paddingTop: 8 }}>{renderDetail(r)}</div>}
                </li>
              )
            })}
            {filtered.length > cardLimit && (
              <li style={{ padding: 12 }}>
                <button className="btn" style={{ width: '100%' }} onClick={() => setCardLimit((n) => n + CARD_PAGE)}>
                  Show more ({filtered.length - cardLimit} remaining)
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
