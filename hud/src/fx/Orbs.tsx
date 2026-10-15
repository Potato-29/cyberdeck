import { m, useReducedMotion } from 'motion/react'

/**
 * Slow drifting colour field behind the bento — the Aurora idea from React
 * Bits, done with three blurred divs on transforms instead of WebGL so the
 * phone's GPU stays cool. Static when reduced motion is on.
 */
const ORBS = [
  { c: 'var(--orb-1)', x: ['-20vw', '30vw', '-20vw'], y: ['-30vh', '10vh', '-30vh'], d: 38 },
  { c: 'var(--orb-2)', x: ['60vw', '20vw', '60vw'], y: ['40vh', '-10vh', '40vh'], d: 46 },
  { c: 'var(--orb-3)', x: ['10vw', '50vw', '10vw'], y: ['60vh', '50vh', '60vh'], d: 54 },
]

export function Orbs() {
  const reduce = useReducedMotion()
  return (
    <div className="orbs" aria-hidden>
      {ORBS.map((o, i) => (
        <m.div
          key={i}
          className="orb"
          style={{ background: o.c, x: o.x[0], y: o.y[0] }}
          animate={reduce ? undefined : { x: o.x, y: o.y }}
          transition={{ duration: o.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}
