import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Poll `fn` every `ms` while `enabled`. Pauses while the tab is hidden (the
 * phone screen is off most of the day) and refetches immediately on return.
 * Failures keep the last good data and back off up to 4x. Copied from hud/,
 * plus `enabled` so data nobody on screen needs is never fetched.
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<number>(0)
  const fails = useRef(0)
  const on = useRef(enabled)
  on.current = enabled

  const tick = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (!on.current) return
    try {
      setData(await fnRef.current())
      setError(false)
      fails.current = 0
    } catch {
      setError(true)
      fails.current = Math.min(fails.current + 1, 2)
    }
    if (!document.hidden && on.current) {
      timer.current = window.setTimeout(tick, ms * 2 ** fails.current)
    }
  }, [ms])

  useEffect(() => {
    if (!enabled) return
    tick()
    const onVis = () => {
      if (document.hidden) window.clearTimeout(timer.current)
      else tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [tick, enabled])

  /** Refresh soon (after a control action) without waiting a full interval. */
  const refresh = useCallback((delay = 0) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(tick, delay)
  }, [tick])

  return { data, error, refresh }
}
