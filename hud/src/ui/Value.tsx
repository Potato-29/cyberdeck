import { useEffect, useRef } from 'react'

/**
 * A reading with its unit. When the text changes the span is re-keyed, which
 * restarts the CSS `flash` keyframe (theme.css) — a tinted background that
 * fades out in 350ms. The first render doesn't flash.
 */
export function Val({ v, dec = 0, unit, flash = true }: {
  v: number | null | undefined
  dec?: number
  unit?: string
  flash?: boolean
}) {
  const text = v == null || !Number.isFinite(v) ? '–' : v.toFixed(dec)
  const prev = useRef<string | undefined>(undefined)
  const changed = flash && prev.current !== undefined && prev.current !== text
  useEffect(() => { prev.current = text })
  return (
    <span className="val">
      <span key={changed ? text : 'static'} className={changed ? 'flash' : undefined}>{text}</span>
      {unit && text !== '–' && <small>{unit}</small>}
    </span>
  )
}
