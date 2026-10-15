import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

type Phase = 'idle' | 'busy' | 'ok' | 'err'

/**
 * Button that runs an async task and shows its own outcome — spinner while
 * running, then Done/Failed for a beat, then back. Labels cross-fade by
 * sliding vertically so the width change never jumps.
 */
export function Chip({ onRun, children, className = '', okLabel = 'Done', errLabel = 'Failed', disabled, small, title }: {
  onRun: () => Promise<unknown>
  children: ReactNode
  className?: string
  okLabel?: ReactNode
  errLabel?: ReactNode
  disabled?: boolean
  small?: boolean
  title?: string
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const t = useRef(0)
  useEffect(() => () => window.clearTimeout(t.current), [])

  const run = async () => {
    if (phase === 'busy') return
    setPhase('busy')
    try {
      await onRun()
      setPhase('ok')
    } catch (e) {
      // A declined confirm is not a failure — just go back to idle.
      if (e instanceof Error && e.message === 'cancelled') { setPhase('idle'); return }
      setPhase('err')
    }
    t.current = window.setTimeout(() => setPhase('idle'), 2200)
  }

  const content =
    phase === 'busy' ? <Spinner /> :
    phase === 'ok' ? okLabel :
    phase === 'err' ? errLabel : children

  return (
    <m.button
      className={`chip ${small ? 'small' : ''} ${phase === 'ok' ? 'ok' : phase === 'err' ? 'danger' : className}`}
      onClick={run}
      disabled={disabled}
      title={title}
      whileTap={{ scale: 0.94 }}
      layout="position"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={phase}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        >
          {content}
        </m.span>
      </AnimatePresence>
    </m.button>
  )
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <m.svg
      width={size} height={size} viewBox="0 0 24 24"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </m.svg>
  )
}
