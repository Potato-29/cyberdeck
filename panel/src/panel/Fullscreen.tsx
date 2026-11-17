import { useEffect, useState, type PointerEvent } from 'react'

// Fullscreen for Chrome on the deck. Browsers only allow it from a user
// gesture, so: a button to turn it on, and once it has been used the panel
// re-enters on the first tap after every reload (or after Chrome's back
// gesture drops out of it). Only the button turns that off.

const KEY = 'panel-fs'
const remembered = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ } }

async function enter() {
  try {
    await document.documentElement.requestFullscreen()
    // Lock landscape where the browser allows it (Android Chrome in fullscreen), as hud/ does.
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await o.lock?.('landscape').catch(() => {})
  } catch { /* fullscreen not available */ }
}

function useIsFullscreen() {
  const [fs, setFs] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  return fs
}

/** Re-enter fullscreen on the next tap whenever it's remembered and we're out of it. The tap still does its job. */
export function useAutoFullscreen() {
  const fs = useIsFullscreen()
  useEffect(() => {
    if (fs || !document.fullscreenEnabled || !remembered()) return
    const tap = () => { if (remembered() && !document.fullscreenElement) enter() }
    window.addEventListener('pointerdown', tap, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', tap, { capture: true })
  }, [fs])
}

export function FullscreenButton() {
  const fs = useIsFullscreen()
  if (!document.fullscreenEnabled) return null
  const flip = async () => {
    if (document.fullscreenElement) {
      remember(false)
      try { await document.exitFullscreen() } catch { /* already out */ }
    } else {
      remember(true)
      await enter()
    }
  }
  return (
    <button
      className="fs-btn"
      aria-label={fs ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={fs ? 'Exit fullscreen' : 'Fullscreen'}
      // Don't let this tap start the dots' long-press overview, or count as the auto-enter tap.
      onPointerDown={(e: PointerEvent) => e.stopPropagation()}
      onClick={flip}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {fs
          ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  )
}
