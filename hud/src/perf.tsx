import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// ── Lite mode ─────────────────────────────────────────────
// The deck itself (Honor Play, Kirin 970) can't hold 60fps through the full
// effects that a newer phone shrugs off. Lite mode keeps the same layout but:
// one opacity fade per page instead of per-tile springs, numbers set instead
// of counted, static background, opaque tiles, no scroll-edge masks.
//
// Decided by, in order: ?lite=1 / ?lite=0 (remembered; ?lite=auto forgets),
// then a frame-time probe during the first page's entry animation.

const KEY = 'hud-lite'

function forced(): boolean | null {
  try {
    const q = new URLSearchParams(location.search).get('lite')
    if (q === '1' || q === '0') localStorage.setItem(KEY, q)
    if (q === 'auto') localStorage.removeItem(KEY)
    const s = localStorage.getItem(KEY)
    return s === '1' ? true : s === '0' ? false : null
  } catch { return null }
}

/** 75th-percentile frame time (ms) over the next `n` frames. */
function probe(n = 60): Promise<number> {
  return new Promise((resolve) => {
    const dts: number[] = []
    let last = 0
    const step = (t: number) => {
      if (last) dts.push(t - last)
      last = t
      if (dts.length < n) requestAnimationFrame(step)
      else resolve(dts.sort((a, b) => a - b)[Math.floor(n * 0.75)])
    }
    requestAnimationFrame(step)
  })
}

const Ctx = createContext(false)
export const useLite = () => useContext(Ctx)

export function LiteProvider({ children }: { children: ReactNode }) {
  const [pinned] = useState(forced)
  const [lite, setLite] = useState(pinned ?? false)

  useEffect(() => {
    if (pinned !== null || document.hidden) return
    let live = true
    // Sustained >22ms frames (<45fps) while the first page animates in.
    probe().then((p75) => { if (live && p75 > 22) setLite(true) })
    return () => { live = false }
  }, [pinned])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-lite', lite)
  }, [lite])

  return <Ctx.Provider value={lite}>{children}</Ctx.Provider>
}

// ── Notch ─────────────────────────────────────────────────
// Older Android Chrome/WebView reports env(safe-area-inset-*) as 0 even when
// the page is drawn under the display cutout, so the rail ended up behind
// the Honor Play's notch. If a touch device's viewport spans the whole long
// side of the screen, assume the cutout is inside it and pad that side —
// left when the phone's top points left (angle 90), right at angle 270.
// The CSS takes max() with env(), so devices that do report it are unchanged.
// Width is 32px, overridable once with ?notch=<px> (remembered).

function notchPx(): number {
  try {
    const q = new URLSearchParams(location.search).get('notch')
    if (q && /^\d{1,3}$/.test(q)) localStorage.setItem('hud-notch', q)
    return Number(localStorage.getItem('hud-notch') ?? 32)
  } catch { return 32 }
}

export function useNotchInset() {
  useEffect(() => {
    const px = notchPx()
    const root = document.documentElement
    const apply = () => {
      const angle = screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0)
      const landscape = innerWidth > innerHeight
      const fullWidth = innerWidth >= Math.max(screen.width, screen.height) - 2
      const touch = matchMedia('(pointer: coarse)').matches
      const on = touch && landscape && fullWidth
      root.style.setProperty('--notch-l', on && (angle === 90) ? px + 'px' : '0px')
      root.style.setProperty('--notch-r', on && (angle === 270 || angle === -90) ? px + 'px' : '0px')
    }
    apply()
    // Orientation/fullscreen changes settle a frame or two after the event.
    const later = () => { apply(); window.setTimeout(apply, 250) }
    window.addEventListener('resize', later)
    window.addEventListener('orientationchange', later)
    document.addEventListener('fullscreenchange', later)
    return () => {
      window.removeEventListener('resize', later)
      window.removeEventListener('orientationchange', later)
      document.removeEventListener('fullscreenchange', later)
    }
  }, [])
}
