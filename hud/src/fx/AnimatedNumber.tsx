import { m, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'

/**
 * CountUp-style number that springs between values instead of jumping —
 * after React Bits' CountUp, rebuilt on Motion's useSpring so it shares
 * the app's spring physics and honours reduced motion.
 */
export function AnimatedNumber({ value, decimals = 0, className }: {
  value: number
  decimals?: number
  className?: string
}) {
  const spring = useSpring(value, { stiffness: 90, damping: 20, mass: 0.8 })
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
