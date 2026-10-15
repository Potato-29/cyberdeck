import { useEffect, useState, type ReactNode } from 'react'

// Rings and bars animate with CSS transitions, not Motion: the browser runs
// them without a JavaScript callback per frame, which is what the deck's
// slower CPU chokes on. The bar's scaleX is composited outright.

/** Value 0 on mount, then the real value a frame later, so it fills in. */
function useFillIn(pct: number) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  return shown
}

/** Activity-ring gauge. */
export function Ring({ value, color, size = 84, stroke = 9, children }: {
  value: number | null
  color: string
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const pct = useFillIn(value == null ? 0 : Math.max(0, Math.min(100, value)) / 100)
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.max(pct * 100, 0.01)} 100`}
          style={{ opacity: pct > 0 ? 1 : 0 }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  )
}

/** Thin horizontal meter. */
export function Bar({ value, color }: { value: number | null; color: string }) {
  const pct = useFillIn(value == null ? 0 : Math.max(0, Math.min(100, value)) / 100)
  return (
    <div style={{ height: 8, borderRadius: 4, background: 'var(--tile-2)', overflow: 'hidden' }}>
      <div className="bar-fill" style={{ background: color, transform: `scaleX(${pct})` }} />
    </div>
  )
}

/** Green → orange → red by threshold, the old pcClass/barClass in one place. */
export function level(v: number | null, warn = 50, bad = 80, base = 'var(--green)') {
  if (v == null) return 'var(--text-3)'
  return v >= bad ? 'var(--red)' : v >= warn ? 'var(--orange)' : base
}
