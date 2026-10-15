import { useEffect, useState } from 'react'

export interface Telemetry { rpm: number; speed: number; gear: string }

/**
 * Live Forza telemetry over ws://<host>:8000/ws, same contract as
 * dashboard.html. A page served over https (the tunnel) can't open an
 * insecure socket, so it stays offline there instead of throwing.
 * Goes null after 2s without a packet (game paused but socket alive).
 */
export function useForza(): Telemetry | null {
  const [t, setT] = useState<Telemetry | null>(null)

  useEffect(() => {
    if (location.protocol === 'https:') return
    const host = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'localhost:8000' : location.hostname + ':8000'
    let ws: WebSocket | null = null
    let last = 0
    let retry = 0
    let closed = false

    const connect = () => {
      try { ws = new WebSocket(`ws://${host}/ws`) } catch { return }
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          last = Date.now()
          const g = d.gear === 0 ? 'R' : d.gear === 11 ? 'N' : String(d.gear ?? '–')
          setT({ rpm: Math.round((d.rpm || 0) / 100) * 100, speed: Math.round(d.speed_kmh || 0), gear: g })
        } catch { /* malformed packet */ }
      }
      ws.onclose = () => {
        setT(null)
        if (!closed) retry = window.setTimeout(connect, 5000)
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    const watchdog = window.setInterval(() => {
      if (Date.now() - last > 2000) setT(null)
    }, 1000)

    return () => {
      closed = true
      window.clearTimeout(retry)
      window.clearInterval(watchdog)
      ws?.close()
    }
  }, [])

  return t
}
