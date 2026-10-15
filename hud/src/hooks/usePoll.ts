import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Poll `fn` every `ms`. Pauses while the tab is hidden (the phone screen is
 * off most of the day) and refetches immediately on return. Failures keep the
 * last good data and back off up to 4x so a dead PC link isn't hammered.
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<number>(0)
  const fails = useRef(0)

  const tick = useCallback(async () => {
    window.clearTimeout(timer.current)
    try {
      setData(await fnRef.current())
      setError(false)
      fails.current = 0
    } catch {
      setError(true)
      fails.current = Math.min(fails.current + 1, 2)
    }
    if (!document.hidden) {
      timer.current = window.setTimeout(tick, ms * 2 ** fails.current)
    }
  }, [ms])

  useEffect(() => {
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
  }, [tick])

  /** Refresh soon (after a control action) without waiting a full interval. */
  const refresh = useCallback((delay = 0) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(tick, delay)
  }, [tick])

  return { data, error, refresh }
}
