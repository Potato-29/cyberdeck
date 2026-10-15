import { m } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { useLite } from '../perf'
import { IcExpand } from './icons'

// Translate + fade only — no scale, which forces the tile's SVGs and text to
// re-rasterise every frame on a weak GPU.
const full = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
} as const
// Lite: tiles don't animate on their own; the page fades in as one layer.
const lite = { hidden: {}, show: {} } as const

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
  const isLite = useLite()
  return (
    <m.section
      className="tile"
      layoutId={onExpand ? 'tile-' + id : undefined}
      variants={isLite ? lite : full}
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
