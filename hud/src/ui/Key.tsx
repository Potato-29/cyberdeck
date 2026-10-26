import { useEffect, useRef, useState, type ReactNode } from 'react'

type Phase = 'idle' | 'busy' | 'ok' | 'err'

/**
 * Hardware-style key that runs an async task and reports on itself:
 * `…` while running, then OK / ERR for 2s, then back. Pressed state is a CSS
 * :active invert — nothing here animates.
 */
export function Key({ onRun, children, tone = '', small, disabled, title }: {
  onRun: () => Promise<unknown>
  children: ReactNode
  tone?: '' | 'acc' | 'ok' | 'bad' | 'dim'
  small?: boolean
  disabled?: boolean
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
    t.current = window.setTimeout(() => setPhase('idle'), 2000)
  }

  const shown = phase === 'busy' ? '…' : phase === 'ok' ? 'OK' : phase === 'err' ? 'ERR' : children
  const cls = phase === 'ok' ? 'ok' : phase === 'err' ? 'bad' : tone
  return (
    <button className={`key ${cls} ${small ? 'small' : ''}`} onClick={run} disabled={disabled} title={title}>
      {shown}
    </button>
  )
}
