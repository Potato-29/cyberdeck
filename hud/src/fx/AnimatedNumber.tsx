import { m, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { useLite } from '../perf'

/**
 * CountUp-style number that springs between values instead of jumping —
 * after React Bits' CountUp, rebuilt on Motion's useSpring. Each frame of the
 * count rewrites text (layout + paint), so lite mode just sets the value.
 */
export function AnimatedNumber({ value, decimals = 0, className }: {
  value: number
  decimals?: number
  className?: string
}) {
  const lite = useLite()
  return lite
    ? <span className={'num ' + (className ?? '')}>{value.toFixed(decimals)}</span>
    : <SpringNumber value={value} decimals={decimals} className={className} />
}

function SpringNumber({ value, decimals, className }: { value: number; decimals: number; className?: string }) {
  // Critically damped and quick: settles in ~0.5s so it isn't still
  // repainting when the next 4s poll lands.
  const spring = useSpring(value, { stiffness: 140, damping: 26, restDelta: 0.5 })
  const text = useTransform(spring, (v) => v.toFixed(decimals))
  useEffect(() => { spring.set(value) }, [spring, value])
  return <m.span className={'num ' + (className ?? '')}>{text}</m.span>
}

/** A number, or an en dash when the backend didn't have one. */
export function Num({ value, decimals, unit, className, style }: {
  value: number | null | undefined
  decimals?: number
  unit?: string
  className?: string
  style?: React.CSSProperties
}) {
  if (value == null || !Number.isFinite(value)) return <span className={'num faint ' + (className ?? '')} style={style}>–</span>
  return (
    <span className={className} style={style}>
      <AnimatedNumber value={value} decimals={decimals} />
      {unit && (unit === '°' ? unit : <span className="unit">{unit}</span>)}
    </span>
  )
}
