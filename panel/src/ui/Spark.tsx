/** Polyline(s) over the last samples. Each series is scaled to its own range. */
export interface Series { values: number[]; min: number; max: number; color: string }

export function Spark({ series, fill = true }: { series: Series[]; fill?: boolean }) {
  const W = 100, H = 40
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {series.map((s, i) => {
        if (s.values.length < 2) return null
        const n = s.values.length
        const pts = s.values.map((v, j) => {
          const x = (j / (n - 1)) * W
          const y = H - Math.max(0, Math.min(1, (v - s.min) / (s.max - s.min || 1))) * (H - 2) - 1
          return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        return (
          <g key={i}>
            {fill && i === 0 && <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={s.color} opacity="0.12" />}
            <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        )
      })}
    </svg>
  )
}
