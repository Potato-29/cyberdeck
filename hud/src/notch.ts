import { useEffect } from 'react'

// ── Notch ─────────────────────────────────────────────────
// Older Android Chrome/WebView reports env(safe-area-inset-*) as 0 even when
// the page is drawn under the display cutout, so the top bar ended up behind
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
