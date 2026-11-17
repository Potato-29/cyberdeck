import type { ReactNode } from 'react'

/**
 * A ring gauge: a 270° arc open at the bottom, as in PhoneBox's dashboard.
 * Drawn once as SVG; a value change animates stroke-dashoffset in CSS, so no
 * JavaScript runs per frame.
 */
export function Ring({ frac, color, children, width = 9 }: { frac: number; color: string; children?: ReactNode; width?: number }) {
  const r = 50 - width / 2 - 1
  const C = 2 * Math.PI * r
  const arc = C * 0.75
  const f = Math.max(0, Math.min(1, frac))
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="rotate(135 50 50)">
          <circle cx="50" cy="50" r={r} className="ring-bg" strokeWidth={width} strokeDasharray={`${arc} ${C}`} />
          <circle
            cx="50" cy="50" r={r} className="ring-fg" stroke={color} strokeWidth={width}
            strokeDasharray={`${arc} ${C}`} strokeDashoffset={arc * (1 - f)}
          />
        </g>
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  )
}
