import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { getJson } from '../api'
import { PanelCtx } from '../ctx'
import { DataProvider } from '../data'
import { usePoll } from '../hooks/usePoll'
import { useNotchInset } from '../notch'
import type { Catalog, Config, PanelEvent } from '../types'
import { ConfirmProvider } from '../ui/Confirm'
import { ToastProvider, useToast } from '../ui/Toast'
import { Grid } from './Grid'

interface EventsResp { boot: string; seq: number; events: PanelEvent[] }

const HOLD_AFTER_TOUCH = 10_000 // a page switch waits this long after the last touch

export function PanelApp() {
  useNotchInset()
  useWakeLock()
  // Config is re-read every 5s; a save in the editor bumps rev and the panel
  // follows within a few seconds, same as PhoneBox.
  const config = usePoll(() => getJson<Config>('/panel/config'), 5000)
  const catalog = usePoll(() => getJson<Catalog>('/panel/catalog'), 300_000)
  if (!config.data || !catalog.data) {
    return <div className="boot">{config.error || catalog.error ? 'Can’t reach the hub — check the token in the URL' : 'Loading…'}</div>
  }
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Panel config={config.data} catalog={catalog.data} />
      </ConfirmProvider>
    </ToastProvider>
  )
}

function Panel({ config, catalog }: { config: Config; catalog: Catalog }) {
  const toast = useToast()
  const specs = useMemo(() => Object.fromEntries(catalog.widgets.map((w) => [w.type, w])), [catalog])
  const pages = useMemo(() => {
    const shown = config.pages.filter((p) => p.shown !== false)
    return shown.length ? shown : config.pages
  }, [config])
  const homeId = config.home && pages.some((p) => p.id === config.home) ? config.home : pages[0]?.id

  const [pageId, setPageId] = useState<string>(() => {
    try { return localStorage.getItem('panel-page') ?? '' } catch { return '' }
  })
  const idx = Math.max(0, pages.findIndex((p) => p.id === pageId))
  const page = pages[idx]
  useEffect(() => {
    try { localStorage.setItem('panel-page', page.id) } catch { /* private mode */ }
  }, [page.id])

  const lastTouch = useRef(Date.now())
  const go = useCallback((id: string) => {
    lastTouch.current = Date.now()
    setPageId(id)
  }, [])
  const step = useCallback((d: number) => go(pages[(idx + d + pages.length) % pages.length].id), [go, idx, pages])

  // ── Page switches requested by webhooks: count down, Stay / Go now ──
  const [pending, setPending] = useState<{ page: string; left: number } | null>(null)
  const requestGoto = useCallback((id: string, secs = 3) => {
    if (!pages.some((p) => p.id === id)) return
    if (secs <= 0) { go(id); setPending(null) } else setPending({ page: id, left: secs })
  }, [pages, go])
  const held = pending != null && Date.now() - lastTouch.current < HOLD_AFTER_TOUCH
  useEffect(() => {
    if (!pending) return
    const t = window.setInterval(() => {
      if (Date.now() - lastTouch.current < HOLD_AFTER_TOUCH) { setPending((p) => (p ? { ...p } : p)); return }
      setPending((p) => {
        if (!p) return p
        if (p.left <= 1) { setPageId(p.page); return null }
        return { ...p, left: p.left - 1 }
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [pending != null]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Events: notify + goto, polled every 2s ──
  const [notes, setNotes] = useState<PanelEvent[]>([])
  const boot = useRef<string | null>(null)
  const seq = useRef(0)
  const events = usePoll(() => getJson<EventsResp>('/panel/events', { since: seq.current }), 2000)
  useEffect(() => {
    const r = events.data
    if (!r) return
    if (boot.current === null) {
      // First load: show past notifications in the widget, but don't replay toasts or switches.
      boot.current = r.boot
      seq.current = r.seq
      setNotes(r.events.filter((e) => e.kind === 'notify'))
      return
    }
    if (r.boot !== boot.current) {
      // The hub restarted and its counter began again; read everything new from 0.
      boot.current = r.boot
      seq.current = 0
      events.refresh(0)
      return
    }
    const fresh = r.events.filter((e) => e.seq > seq.current)
    seq.current = Math.max(seq.current, r.seq)
    for (const e of fresh) {
      if (e.kind === 'notify') {
        toast(e.title || e.text || '', { text: e.title ? e.text : undefined, level: e.level, seconds: e.seconds })
        setNotes((n) => [...n.slice(-29), e])
        if (navigator.vibrate) try { navigator.vibrate(60) } catch { /* not allowed */ }
        if (e.page) requestGoto(e.page, 3)
      } else if (e.kind === 'goto' && e.page) {
        requestGoto(e.page, e.countdown ?? 3)
      }
    }
  }, [events.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Back home when idle ──
  useEffect(() => {
    const mins = config.idleMinutes ?? 5
    if (!mins || !homeId) return
    const t = window.setInterval(() => {
      if (!pending && Date.now() - lastTouch.current > mins * 60_000) setPageId((cur) => (cur === homeId ? cur : homeId))
    }, 15_000)
    return () => window.clearInterval(t)
  }, [config.idleMinutes, homeId, pending])

  // ── Input: flick, arrows, dots, overview ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    lastTouch.current = Date.now()
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current
    start.current = null
    if (!s || (e.target as HTMLElement).closest('input[type=range]')) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    // A flick, judged on release; the page doesn't follow the finger (hud/ rule for the Kirin 970).
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) step(dx < 0 ? 1 : -1)
  }

  const [overview, setOverview] = useState(false)
  const press = useRef(0)
  const pendingTitle = pending ? pages.find((p) => p.id === pending.page)?.title : ''

  const types = useMemo(() => new Set(page.widgets.map((w) => w.type)), [page])
  const api = useMemo(() => ({ config, specs, goto: go }), [config, specs, go])

  return (
    <PanelCtx.Provider value={api}>
      <DataProvider types={types} notes={notes}>
        <div className="panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onMouseDown={() => { lastTouch.current = Date.now() }}>
          <div className="page fade" key={page.id}><Grid page={page} /></div>
          {pages.length > 1 && (
            <div
              className="dots"
              onPointerDown={() => { press.current = window.setTimeout(() => setOverview(true), 500) }}
              onPointerUp={() => window.clearTimeout(press.current)}
              onPointerLeave={() => window.clearTimeout(press.current)}
            >
              {pages.map((p, i) => (
                <button key={p.id} className={'dot-b' + (i === idx ? ' on' : '')} aria-label={p.title} onClick={() => (i === idx ? setOverview(true) : go(p.id))} />
              ))}
            </div>
          )}
          {pending && (
            <div className="countdown fade">
              <span>{held ? `Switching to ${pendingTitle} when you’re done…` : `Switching to ${pendingTitle} in ${pending.left}…`}</span>
              <button className="btn" onClick={() => setPending(null)}>Stay</button>
              <button className="btn primary" onClick={() => { go(pending.page); setPending(null) }}>Go now</button>
            </div>
          )}
          {overview && (
            <div className="scrim fade" onClick={() => setOverview(false)}>
              <div className="overview" onClick={(e) => e.stopPropagation()}>
                {pages.map((p) => (
                  <button key={p.id} className={'ov-page' + (p.id === page.id ? ' on' : '')} onClick={() => { go(p.id); setOverview(false) }}>
                    <span className="ov-ic">{p.icon}</span>
                    <span>{p.title}</span>
                    <span className="dim">{p.widgets.length} widgets</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DataProvider>
    </PanelCtx.Provider>
  )
}

/** Keep the screen on while the panel is visible (PhoneBox does). Re-acquired on return. */
function useWakeLock() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }
    if (!nav.wakeLock) return
    let lock: Lock | null = null
    const get = () => { if (!document.hidden) nav.wakeLock!.request('screen').then((l) => { lock = l }).catch(() => {}) }
    get()
    document.addEventListener('visibilitychange', get)
    return () => {
      document.removeEventListener('visibilitychange', get)
      lock?.release().catch(() => {})
    }
  }, [])
}
