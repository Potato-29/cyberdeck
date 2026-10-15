import { m } from 'motion/react'
import type { ReactNode } from 'react'

/** Activity-ring gauge. pathLength springs to the new value on every poll. */
export function Ring({ value, color, size = 84, stroke = 9, children }: {
  value: number | null
  color: string
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={stroke} />
        <m.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(pct, 0.001), stroke: color }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  )
}

/** Thin horizontal meter, same spring as Ring. Animates scaleX, not width. */
export function Bar({ value, color }: { value: number | null; color: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100
  return (
    <div style={{ height: 8, borderRadius: 4, background: 'var(--tile-2)', overflow: 'hidden' }}>
      <m.div
        style={{ height: '100%', borderRadius: 4, background: color, transformOrigin: 'left' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct, backgroundColor: color }}
        transition={{ type: 'spring', stiffness: 60, damping: 16 }}
      />
    </div>
  )
}

/** Green → orange → red by threshold, the old pcClass/barClass in one place. */
export function level(v: number | null, warn = 50, bad = 80, base = 'var(--green)') {
  if (v == null) return 'var(--text-3)'
  return v >= bad ? 'var(--red)' : v >= warn ? 'var(--orange)' : base
}
