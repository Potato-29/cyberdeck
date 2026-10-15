import { AnimatePresence, m, type PanInfo } from 'motion/react'
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { isUp } from './api'
import { useData } from './data'
import { useLite, useNotchInset } from './perf'
import { Orbs } from './fx/Orbs'
import { IcChip, IcCore, IcExpand, IcGrid, IcMoon, IcShrink, IcSignal, IcSun } from './ui/icons'
import { CorePage } from './widgets/Core'
import { DeckPage } from './widgets/Deck'
import { PeriphPage } from './widgets/Periph'
import { VitalsPage } from './widgets/Vitals'

// Same four groupings as the old deck selector.
const PAGES: { key: string; label: string; Icon: ComponentType; Page: ComponentType }[] = [
  { key: 'core', label: 'Core', Icon: IcCore, Page: CorePage },
  { key: 'vitals', label: 'Vitals', Icon: IcChip, Page: VitalsPage },
  { key: 'periph', label: 'Periph', Icon: IcSignal, Page: PeriphPage },
  { key: 'deck', label: 'Deck', Icon: IcGrid, Page: DeckPage },
]

const pageVariants = {
  enter: (dir: number) => ({ x: dir * 48, opacity: 0 }),
  show: {
    x: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 360, damping: 36, staggerChildren: 0.04 },
  },
  exit: (dir: number) => ({ x: dir * -48, opacity: 0, transition: { duration: 0.16 } }),
} as const

// Lite: the old page fades out, then the new one fades in — one opacity
// animation at a time (Motion hands opacity to the compositor), and React
// renders the new page while nothing else is moving.
const litePageVariants = {
  enter: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.16, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
} as const

function initialPage() {
  try {
    const i = PAGES.findIndex((p) => p.key === localStorage.getItem('hud-page'))
    return i < 0 ? 0 : i
  } catch { return 0 }
}

export default function App() {
  const [[page, dir], setPage] = useState<[number, number]>(() => [initialPage(), 0])
  const lite = useLite()
  useNotchInset()

  const go = useCallback((next: number) => {
    setPage(([cur]) => {
      const n = (next + PAGES.length) % PAGES.length
      return n === cur ? [cur, 0] : [n, n > cur ? 1 : -1]
    })
  }, [])

  useEffect(() => {
    try { localStorage.setItem('hud-page', PAGES[page].key) } catch { /* private mode */ }
  }, [page])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(page + 1)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, page])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2
    if (swipe < -80) go(page + 1)
    else if (swipe > 80) go(page - 1)
  }

  const { Page } = PAGES[page]
  return (
    <>
      <Orbs />
      <div className="shell">
        <Rail page={page} go={go} />
        <main className="stage">
          <AnimatePresence initial={true} custom={dir} mode={lite ? 'wait' : 'popLayout'}>
            <m.div
              key={PAGES[page].key}
              className="page"
              custom={dir}
              variants={lite ? litePageVariants : pageVariants}
              initial="enter"
              animate="show"
              exit="exit"
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={onDragEnd}
            >
              <Page />
            </m.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  )
}

function Rail({ page, go }: { page: number; go: (i: number) => void }) {
  const { dash } = useData()
  const svcs = Object.values(dash.data?.services ?? {})
  const healthy = !dash.error && svcs.every(isUp)

  return (
    <nav className="rail">
      <Clock />
      <span className={'global-dot ' + (healthy ? '' : 'bad ripple')}
        title={healthy ? 'All services up' : dash.error ? 'Hub unreachable' : 'Service down'} />
      <div className="rail-nav">
        {PAGES.map((p, i) => (
          <m.button key={p.key} className="rail-btn" aria-label={p.label} aria-current={i === page ? 'page' : undefined}
            onClick={() => go(i)} whileTap={{ scale: 0.88 }}>
            {i === page && (
              <m.span layoutId="rail-pill" className="rail-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
            )}
            <p.Icon />
          </m.button>
        ))}
      </div>
      <div className="rail-foot">
        <ThemeToggle />
        <FullscreenToggle />
      </div>
    </nav>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return (
    <div className="rail-clock num">
      <span>{hh}</span>
      <span>{mm}</span>
      <span className="sec">{ss}</span>
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const t = document.documentElement.getAttribute('data-theme')
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  })
  const flip = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    try { localStorage.setItem('hud-theme', next ? 'dark' : 'light') } catch { /* private mode */ }
  }
  return (
    <m.button className="rail-btn" aria-label="Toggle theme" onClick={flip} whileTap={{ scale: 0.85 }}>
      <AnimatePresence mode="wait" initial={false}>
        <m.span key={String(dark)} style={{ display: 'inline-flex' }}
          initial={{ rotate: -90, scale: 0, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
          {dark ? <IcMoon /> : <IcSun />}
        </m.span>
      </AnimatePresence>
    </m.button>
  )
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
  return (
    <m.button className="rail-btn" aria-label="Fullscreen" onClick={flip} whileTap={{ scale: 0.85 }}>
      {fs ? <IcShrink /> : <IcExpand />}
    </m.button>
  )
}
