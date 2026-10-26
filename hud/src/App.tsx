import { useCallback, useEffect, useRef, useState, type ComponentType, type TouchEvent } from 'react'
import { isUp } from './api'
import { useData } from './data'
import { useNotchInset } from './notch'
import { IcExpand, IcMoon, IcShrink, IcSun } from './ui/icons'
import { Led } from './ui/Panel'
import { CorePage } from './widgets/Core'
import { DeckPage } from './widgets/Deck'
import { PeriphPage } from './widgets/Periph'
import { VitalsPage } from './widgets/Vitals'

// Same four groupings as the original deck selector.
const PAGES: { key: string; label: string; Page: ComponentType }[] = [
  { key: 'core', label: 'CORE', Page: CorePage },
  { key: 'vitals', label: 'VITALS', Page: VitalsPage },
  { key: 'periph', label: 'PERIPH', Page: PeriphPage },
  { key: 'deck', label: 'DECK', Page: DeckPage },
]

function initialPage() {
  try {
    const i = PAGES.findIndex((p) => p.key === localStorage.getItem('hud-page'))
    return i < 0 ? 0 : i
  } catch { return 0 }
}

export default function App() {
  const [page, setPage] = useState(initialPage)
  useNotchInset()

  const step = useCallback((d: number) => setPage((c) => (c + d + PAGES.length) % PAGES.length), [])

  useEffect(() => {
    try { localStorage.setItem('hud-page', PAGES[page].key) } catch { /* private mode */ }
  }, [page])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // Swipe = a flick, judged on release. The page doesn't follow the finger —
  // dragging a full-screen layer is exactly what the deck can't afford.
  const start = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current
    start.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
  }

  const { Page } = PAGES[page]
  return (
    <div className="shell">
      <TopBar page={page} onPick={setPage} />
      <main className="stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="page" key={PAGES[page].key}>
          <Page />
        </div>
      </main>
    </div>
  )
}

function TopBar({ page, onPick }: { page: number; onPick: (i: number) => void }) {
  const { dash } = useData()
  const svcs = Object.values(dash.data?.services ?? {})
  const healthy = !dash.error && svcs.every(isUp)

  return (
    <nav className="topbar">
      {PAGES.map((p, i) => (
        <button key={p.key} className="tab" aria-current={i === page ? 'page' : undefined} onClick={() => onPick(i)}>
          {p.label}
        </button>
      ))}
      <span className="spacer" />
      <ThemeToggle />
      <FullscreenToggle />
      <div className="clock num" title={healthy ? 'All services up' : dash.error ? 'Hub unreachable' : 'Service down'}>
        <Led up={healthy} />
        <Clock />
      </div>
    </nav>
  )
}

function Clock() {
  const fmt = () => {
    const d = new Date()
    return [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')]
  }
  const [[hh, mm], setT] = useState(fmt)
  // Minute resolution: re-render the bar six times a minute, not sixty.
  useEffect(() => {
    const id = window.setInterval(() => setT(fmt()), 10000)
    return () => window.clearInterval(id)
  }, [])
  return <span>{hh}<span className="colon">:</span>{mm}</span>
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const t = document.documentElement.getAttribute('data-theme')
    return t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches
  })
  const flip = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    try { localStorage.setItem('hud-theme', next ? 'dark' : 'light') } catch { /* private mode */ }
  }
  return <button className="tbtn" aria-label="Toggle theme" onClick={flip}>{dark ? <IcMoon /> : <IcSun />}</button>
}

function FullscreenToggle() {
  const [fs, setFs] = useState(false)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const flip = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else {
        await document.documentElement.requestFullscreen()
        // Lock landscape where the browser allows it (Android Chrome in fullscreen).
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        await o.lock?.('landscape').catch(() => {})
      }
    } catch { /* fullscreen not available (iOS Safari) */ }
  }
  return <button className="tbtn" aria-label="Fullscreen" onClick={flip}>{fs ? <IcShrink /> : <IcExpand />}</button>
}
