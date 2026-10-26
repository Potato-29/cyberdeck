/**
 * Segmented LED meter: `n` cells, the first round(value% × n) lit. Plain
 * divs and a colour transition — no SVG, no animation loop. With `steps` the
 * cells rise left to right (signal bars).
 */
export function Meter({ value, n = 10, color = 'var(--acc)', steps, tall }: {
  value: number | null
  n?: number
  color?: string
  steps?: boolean
  tall?: boolean
}) {
  const lit = value == null ? 0 : Math.round((Math.max(0, Math.min(100, value)) / 100) * n)
  return (
    <div className={'meter' + (steps ? ' steps' : '') + (tall ? ' tall' : '')} style={{ ['--c' as string]: color }}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : undefined} style={steps ? { height: `${((i + 1) / n) * 100}%` } : undefined} />
      ))}
    </div>
  )
}

/** Accent → amber → red by threshold; faint when there is no reading. */
export function level(v: number | null, warn = 50, bad = 80, base = 'var(--acc)') {
  if (v == null) return 'var(--faint)'
  return v >= bad ? 'var(--bad)' : v >= warn ? 'var(--warn)' : base
}
