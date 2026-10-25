import { useEffect, useRef, useState } from 'react'

/** Open state for an anchored popover that closes on outside click and Escape. */
export function usePopover<T extends HTMLElement = HTMLDivElement>(): {
  open: boolean
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void
  ref: React.RefObject<T | null>
} {
  const [open, setOpen] = useState(false)
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}
