import { useEffect, useState, type CSSProperties } from 'react'
import { call } from '../api'
import { useData } from '../data'
import { opt } from '../types'
import { useToast } from '../ui/Toast'
import type { WidgetProps } from './types'

const Prev = () => <svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
const Next = () => <svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
const Play = () => <svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" /></svg>
const Pause = () => <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
const Speaker = () => <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>

export function Media({ w, spec }: WidgetProps) {
  const { spotify } = useData()
  const toast = useToast()
  const d = spotify.data
  // Optimistic state so a tap feels instant; dropped on the next poll.
  const [playing, setPlaying] = useState<boolean | null>(null)
  const [vol, setVol] = useState<number | null>(null)
  useEffect(() => { setPlaying(null) }, [d])
  const isPlaying = playing ?? !!d?.playing

  const send = async (op: string, params: Record<string, number> = {}) => {
    try { await call('/spotify/control', { op, ...params }) } catch (e) { toast('Spotify', { text: (e as Error).message, level: 'error', seconds: 4 }) }
    spotify.refresh(600)
  }

  if (d && !d.configured) return <div className="empty">Spotify isn't set up — see docs/hud.md → Music</div>
  const volume = vol ?? d?.volume ?? 0
  const canVol = opt<boolean>(w, spec, 'volume') && d?.supports_volume !== false && d?.volume != null
  const prog = d?.duration_ms ? (d.progress_ms ?? 0) / d.duration_ms : 0

  return (
    <div className="media">
      <div className="media-top">
        {d?.art ? <img className="media-art" src={d.art} alt="" /> : <div className="media-art none">♪</div>}
        <div className="media-meta clip">
          <div className="media-src">{d?.device ? 'Spotify · ' + d.device : 'Spotify'}</div>
          <div className="media-t clip">{d?.active ? d.title : 'Nothing playing'}</div>
          <div className="media-a clip dim">{d?.active ? [d.artist, d.album].filter(Boolean).join(' · ') : ''}</div>
          {d?.active && <div className="media-prog"><i style={{ width: prog * 100 + '%' }} /></div>}
        </div>
      </div>
      <div className="media-ctl">
        <button className="ibtn" aria-label="Previous" onClick={() => send('previous')}><Prev /></button>
        <button className="ibtn play" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => { setPlaying(!isPlaying); send(isPlaying ? 'pause' : 'play') }}>
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button className="ibtn" aria-label="Next" onClick={() => send('next')}><Next /></button>
        {canVol && (
          <label className="media-vol">
            <Speaker />
            <input
              type="range" min={0} max={100} value={volume} aria-label="Volume"
              onChange={(e) => setVol(Number(e.target.value))}
              onPointerUp={() => { if (vol != null) send('volume', { level: vol }).then(() => setVol(null)) }}
              onKeyUp={() => { if (vol != null) send('volume', { level: vol }).then(() => setVol(null)) }}
            />
            <span className="dim media-vol-n">{volume}</span>
          </label>
        )}
      </div>
    </div>
  )
}

export function Audio() {
  const { audio } = useData()
  const toast = useToast()
  const a = audio.data
  const off = !a?.online
  const flip = async (target: 'mic' | 'speaker') => {
    try { await call('/audio/toggle', { target }) } catch (e) { toast('PC audio', { text: (e as Error).message, level: 'error' }) }
    audio.refresh(300)
  }
  const btn = (target: 'mic' | 'speaker', muted: boolean | undefined, on: string, offIc: string, label: string) => (
    <button className={'key' + (muted ? ' muted' : '')} style={{ '--k': muted ? '#ff453a' : '#30d158' } as CSSProperties} disabled={off} onClick={() => flip(target)}>
      <span className="key-ic">{muted ? offIc : on}</span>
      <span className="key-l">{label}{muted ? ' muted' : ''}</span>
    </button>
  )
  return (
    <div className="pair">
      {btn('mic', a?.mic_muted, '🎙️', '🔇', 'Mic')}
      {btn('speaker', a?.speaker_muted, '🔊', '🔈', 'Speaker')}
      {off && <div className="pair-off">PC offline</div>}
    </div>
  )
}
