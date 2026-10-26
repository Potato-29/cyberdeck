import type { ReactNode } from 'react'

/** One cell of the grid. `area` is a CSS grid-area ("row / col / row-end / col-end"). */
export function Panel({ area, label, aside, onExpand, children }: {
  area: string
  label: string
  aside?: ReactNode
  onExpand?: () => void
  children: ReactNode
}) {
  return (
    <section className="panel" style={{ gridArea: area }}>
      <header className="ph">
        <span className="lbl">{label}</span>
        {aside != null && <span className="aside">{aside}</span>}
        {onExpand && <button className="ph-btn" aria-label="Expand" onClick={onExpand}>[ + ]</button>}
      </header>
      <div className="pb">{children}</div>
    </section>
  )
}

/** Status LED. A down service blinks (CSS, opacity only). */
export function Led({ up }: { up: boolean }) {
  return <span className={'led' + (up ? '' : ' bad')} />
}
