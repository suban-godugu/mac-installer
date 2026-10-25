import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../../design/Icon'

export interface Command {
  id: string
  group: string
  label: string
  icon: IconName
  hint?: string
  keywords?: string
  run: () => void
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands
    const terms = s.split(/\s+/)
    return commands.filter((c) => {
      const hay = `${c.group} ${c.label} ${c.keywords ?? ''}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [q, commands])

  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    const prev = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => prev?.focus?.()
  }, [open])
  useEffect(() => setActive(0), [q])
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

  if (!open) return null
  const run = (c: Command | undefined): void => {
    if (!c) return
    onClose()
    c.run()
  }

  let lastGroup = ''
  return createPortal(
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Icon name="search" size={18} className="faint" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Jump to a page or run a command..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(results.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(results[active])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'Tab') e.preventDefault()
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id={listId} role="listbox" aria-label="Commands">
          {results.length === 0 && <li className="palette-group muted small">No commands match "{q}".</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup
            lastGroup = c.group
            return (
              <li key={c.id} role="presentation">
                {header && (
                  <div className="palette-group label-micro" aria-hidden="true">
                    {c.group}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette-item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                >
                  <Icon name={c.icon} size={15} />
                  {c.label}
                  {c.hint && <span className="hint">{c.hint}</span>}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Ctrl</kbd> <kbd>K</kbd> toggle
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
