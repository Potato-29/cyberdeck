import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { call, type DeckApp } from '../api'
import { useData } from '../data'
import { ICON_IMAGES } from '../icons'
import { Spinner } from '../ui/Chip'
import { IcGrid, IcMic, IcMicOff, IcSpeaker, IcSpeakerOff, IcX } from '../ui/icons'
import { Tile } from '../ui/Tile'

export function DeckPage() {
  return (
    <>
      <Audio />
      <Launcher />
    </>
  )
}

function Audio() {
  const { audio } = useData()
  const online = audio.data?.online !== false && !!audio.data
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (target: 'mic' | 'speaker') => {
    if (busy) return
    setBusy(target)
    try { await call('/audio/toggle', { target }) } catch { /* state re-polled below */ }
    setBusy(null)
    audio.refresh(0)
  }

  const btn = (target: 'mic' | 'speaker', muted: boolean | undefined) => {
    const live = online && muted === false
    const Icon = target === 'mic' ? (live ? IcMic : IcMicOff) : (live ? IcSpeaker : IcSpeakerOff)
    const color = !online ? 'var(--text-3)' : live ? (target === 'mic' ? 'var(--green)' : 'var(--blue)') : 'var(--red)'
    return (
      <m.button onClick={() => toggle(target)} disabled={!online} whileTap={{ scale: 0.95 }}
        animate={{ backgroundColor: live ? `color-mix(in srgb, ${color} 16%, var(--tile-2))` : 'var(--tile-2)' }}
        style={{ flex: 1, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color }}>
        {busy === target ? <Spinner size={26} /> : (
          <m.span key={String(live)} initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }} style={{ display: 'inline-flex' }}>
            <Icon width={28} height={28} />
          </m.span>
        )}
        <span className="small" style={{ fontWeight: 600 }}>
          {target === 'mic' ? 'Mic' : 'Speaker'} · {!online ? '–' : live ? 'Live' : 'Muted'}
        </span>
      </m.button>
    )
  }

  return (
    <Tile id="audio" area="1 / 1 / 3 / 2" icon={<IcMic />} title="PC audio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {btn('mic', audio.data?.mic_muted)}
        {btn('speaker', audio.data?.speaker_muted)}
      </div>
    </Tile>
  )
}

function Launcher() {
  const { apps } = useData()
  const list = apps.data?.apps ?? []
  const online = !!apps.data?.online
  const running = list.filter((a) => a.running).length
  return (
    <Tile id="deck" area="1 / 2 / 3 / 5" icon={<IcGrid />} title="Launch deck" accent={online ? 'var(--purple)' : undefined}
      aside={!apps.data ? 'connecting…' : online ? `${list.length} apps · ${running} running` : 'PC offline'}>
      {online ? (
        <m.div className="scroll-y"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, alignContent: 'start', flex: 1, paddingBottom: 10 }}
          initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.03 } } }}>
          {list.map((a) => <AppTile key={a.key} app={a} onDone={() => apps.refresh(2500)} />)}
        </m.div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }} className="faint small">
          {apps.data ? 'Agent unreachable — is the PC awake?' : <Spinner />}
        </div>
      )}
    </Tile>
  )
}

function AppTile({ app, onDone }: { app: DeckApp; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const act = async (endpoint: string) => {
    if (state === 'busy') return
    setState('busy')
    try { await call(endpoint, { app: app.key }); setState('ok') } catch { setState('err') }
    onDone()
    window.setTimeout(() => setState('idle'), 2500)
  }
  const icon = ICON_IMAGES[app.key]
  return (
    <m.div
      variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }}
      whileTap={{ scale: 0.92 }}
      onClick={() => act('/deck/launch')}
      animate={state === 'err' ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
      style={{
        position: 'relative', aspectRatio: '1 / 1', maxHeight: 112, borderRadius: 18, background: 'var(--tile-2)', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        boxShadow: app.running ? 'inset 0 0 0 2px var(--green)' : undefined,
      }}>
      <div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
        {state === 'busy' ? <Spinner size={24} /> : icon
          ? <img src={icon} alt="" draggable={false} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 10 }} />
          : <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--purple)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 }}>
              {(app.label ?? app.key).slice(0, 1).toUpperCase()}
            </span>}
      </div>
      <span className="tiny" style={{ fontWeight: 600, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {state === 'ok' ? 'Sent' : state === 'err' ? 'Failed' : app.label ?? app.key}
      </span>
      <AnimatePresence>
        {app.running && app.closable && (
          <m.button aria-label={`Close ${app.label ?? app.key}`}
            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} whileTap={{ scale: 0.8 }}
            onClick={(e) => { e.stopPropagation(); act('/deck/close') }}
            style={{ position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12, background: 'var(--red)', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <IcX width={13} height={13} strokeWidth={2.6} />
          </m.button>
        )}
      </AnimatePresence>
    </m.div>
  )
}
