import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { call, getJson, type SpotifyNow } from '../api'
import { usePoll } from '../hooks/usePoll'
import { IcNext, IcPause, IcPlay, IcPrev } from '../ui/icons'

// Polled here, not in data.tsx: only the visible page is mounted, so Spotify
// is asked only while this tab is open.
const POLL_MS = 3000

const mmss = (ms = 0) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Three big tap zones (prev · art = play/pause · next) over a blurred copy of
 * the album art, and a full-width volume strip underneath. Built for hitting
 * without looking: each zone is a third of the screen.
 */
export function MusicPage() {
  const now = usePoll(() => getJson<SpotifyNow>('/spotify/now'), POLL_MS)
  const d = now.data
  const active = !!d?.active

  // Optimistic play state so the tap feels instant; dropped on the next poll.
  const [playing, setPlaying] = useState<boolean | null>(null)
  useEffect(() => setPlaying(null), [d])
  const isPlaying = playing ?? !!d?.playing

  const [msg, setMsg] = useState('')
  const msgTimer = useRef(0)
  const flashMsg = (m: string) => {
    setMsg(m)
    window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 3000)
  }

  const send = async (op: string, params: Record<string, number> = {}) => {
    try { await call('/spotify/control', { op, ...params }) } catch (e) { flashMsg(String((e as Error).message)) }
    // Spotify takes a moment to report the new track/state.
    now.refresh(op === 'next' || op === 'previous' ? 700 : 400)
  }

  const toggle = () => {
    if (!active) return
    setPlaying(!isPlaying)
    send(isPlaying ? 'pause' : 'play')
  }

  if (d && !d.configured) {
    return (
      <div className="music">
        <div className="music-empty faint">SPOTIFY NOT CONFIGURED — SEE DOCS/HUD.MD</div>
      </div>
    )
  }

  return (
    <div className="music">
      {d?.art_small && <div className="music-bg" style={{ backgroundImage: `url("${d.art_small}")` }} />}
      <div className="music-scrim" />

      <button className="music-zone" aria-label="Previous track" disabled={!active} onClick={() => send('previous')}>
        <IcPrev />
      </button>

      <button className="music-zone music-mid" aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!active} onClick={toggle}>
        <div className="music-art">
          {d?.art
            ? <img src={d.art} alt="" draggable={false} className={isPlaying ? '' : 'paused'} />
            : <div className="music-art-none" />}
          {active && !isPlaying && <span className="music-state"><IcPlay /></span>}
          {active && isPlaying && playing !== null && <span className="music-state"><IcPause /></span>}
        </div>
        <div className="music-meta">
          {msg ? (
            <span className="bad ellipsis">{msg.toUpperCase()}</span>
          ) : active ? (
            <>
              <span className="t ellipsis">{d?.title}</span>
              <span className="a ellipsis dim">{d?.artist}</span>
            </>
          ) : (
            <span className="faint">{d ? 'NOTHING PLAYING' : now.error ? 'HUB UNREACHABLE' : '…'}</span>
          )}
        </div>
      </button>

      <button className="music-zone" aria-label="Next track" disabled={!active} onClick={() => send('next')}>
        <IcNext />
      </button>

      <Volume
        level={d?.volume ?? null}
        disabled={!active || d?.supports_volume === false}
        info={active ? `${d?.device ?? ''} · ${mmss(d?.progress_ms)} / ${mmss(d?.duration_ms)}` : ''}
        onSet={(level) => send('volume', { level })}
      />
    </div>
  )
}

/** Whole-row drag strip. Sends one request on release, not per move. */
function Volume({ level, disabled, info, onSet }: {
  level: number | null
  disabled: boolean
  info: string
  onSet: (level: number) => void
}) {
  // Local value while dragging, and briefly after, so the poll doesn't snap
  // the fill back before Spotify reports the new volume.
  const [local, setLocal] = useState<number | null>(null)
  const hold = useRef(0)
  const dragging = useRef(false)
  const shown = local ?? level ?? 0

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100)
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    window.clearTimeout(hold.current)
    setLocal(at(e))
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setLocal(at(e))
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    const v = at(e)
    setLocal(v)
    onSet(v)
    hold.current = window.setTimeout(() => setLocal(null), 2500)
  }

  return (
    <div
      className={'music-vol' + (disabled ? ' off' : '')}
      role="slider" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      // Keep a horizontal drag here from being read as a page flick by App.
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="fill" style={{ width: `${shown}%` }} />
      <span className="lbl">VOL</span>
      <span className="info ellipsis">{info}</span>
      <span className="num pct">{level == null && local == null ? '--' : shown}</span>
    </div>
  )
}
