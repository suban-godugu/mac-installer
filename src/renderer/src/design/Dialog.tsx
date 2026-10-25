import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Accessible modal: focus trap, Escape to close (unless `alert`), focus restore. */
export function Dialog({
  open,
  title,
  icon,
  tone,
  alert,
  onClose,
  children,
  footer
}: {
  open: boolean
  title: string
  icon?: IconName
  tone?: 'warning' | 'critical'
  alert?: boolean
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && closeRef.current && !alert) {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key !== 'Tab' || !el) return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const a = items[0]
      const b = items[items.length - 1]
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        b.focus()
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, alert])

  if (!open) return null
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !alert && onClose?.()}>
      <div ref={ref} className="dialog" data-tone={tone} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <div className="dialog-head">
          {icon && (
            <span className="dialog-head-icon">
              <Icon name={icon} size={18} />
            </span>
          )}
          <h2 id={titleId} className="grow" style={{ fontSize: 'var(--fs-lg)', paddingTop: icon ? 7 : 0 }}>
            {title}
          </h2>
          {onClose && !alert && (
            <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="dialog-body" id={descId}>
          {children}
        </div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

/** Promise-free confirm flow: render once, call `ask(...)` to open. */
export function useConfirm(): [
  (opts: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void }) => void,
  ReactNode
] {
  const [state, setState] = useState<{ title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null)
  const close = (): void => setState(null)
  const node = (
    <Dialog
      open={!!state}
      title={state?.title ?? ''}
      icon={state?.danger ? 'alert' : 'info'}
      tone={state?.danger ? 'critical' : undefined}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close} data-autofocus>
            Cancel
          </button>
          <button
            className={state?.danger ? 'btn btn-danger-solid' : 'btn btn-primary'}
            onClick={() => {
              state?.onConfirm()
              close()
            }}
          >
            {state?.confirmLabel}
          </button>
        </>
      }
    >
      {state?.body}
    </Dialog>
  )
  return [setState, node]
}
