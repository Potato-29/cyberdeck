import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** Dropdown that closes on outside click or Escape. */
export function Menu({
  label,
  ariaLabel,
  children,
  className = 'btn btn-ghost',
}: {
  label: ReactNode
  ariaLabel?: string
  children: (close: () => void) => ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {label}
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
