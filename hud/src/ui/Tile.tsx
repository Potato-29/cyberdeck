import { m } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { IcExpand } from './icons'

export const tileVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
} as const

/**
 * One bento cell. `area` is a CSS grid-area ("row / col / row-end / col-end").
 * When `onExpand` is set the tile carries a layoutId so the detail sheet can
 * morph out of it.
 */
export function Tile({ id, area, icon, title, aside, accent, onExpand, children, style }: {
  id: string
  area: string
  icon?: ReactNode
  title?: ReactNode
  aside?: ReactNode
  accent?: string
  onExpand?: () => void
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <m.section
      className="tile"
      layoutId={onExpand ? 'tile-' + id : undefined}
      variants={tileVariants}
      style={{ gridArea: area, ...style }}
    >
      {(title || icon) && (
        <header className="tile-head" style={accent ? { color: accent } : undefined}>
          {icon}
          <span>{title}</span>
          {aside != null && <span className="aside">{aside}</span>}
          {onExpand && (
            <m.button
              aria-label="Expand"
              onClick={onExpand}
              whileTap={{ scale: 0.85 }}
              style={{ margin: '-6px -6px -6px ' + (aside != null ? '2px' : 'auto'), color: 'var(--text-3)', padding: 6, display: 'inline-flex' }}
            >
              <IcExpand />
            </m.button>
          )}
        </header>
      )}
      <div className="tile-body">{children}</div>
    </m.section>
  )
}
