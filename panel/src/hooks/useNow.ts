import { useEffect, useState } from 'react'

/** Current time, re-rendered on each `stepMs` boundary (60000 = on the minute). */
export function useNow(stepMs = 60000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t = 0
    const arm = () => {
      const ms = Date.now()
      t = window.setTimeout(() => { setNow(new Date()); arm() }, stepMs - (ms % stepMs) + 15)
    }
    arm()
    return () => window.clearTimeout(t)
  }, [stepMs])
  return now
}
