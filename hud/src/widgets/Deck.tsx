import { useState } from 'react'
import { call, type DeckApp } from '../api'
import { useData } from '../data'
import { ICON_IMAGES } from '../icons'
import { Led, Panel } from '../ui/Panel'

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

  const key = (target: 'mic' | 'speaker', muted: boolean | undefined) => {
    const live = online && muted === false
    const cls = !online ? '' : live ? ' live' : ' muted'
    return (
      <button className={'audio-key' + cls} onClick={() => toggle(target)} disabled={!online}>
        <span>{target === 'mic' ? 'MIC' : 'SPEAKER'}</span>
        <span className="state">{busy === target ? '…' : !online ? '–' : live ? 'LIVE' : 'MUTED'}</span>
      </button>
    )
  }

  return (
    <Panel area="1 / 1 / 3 / 2" label="AUDIO">
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {key('mic', audio.data?.mic_muted)}
        {key('speaker', audio.data?.speaker_muted)}
      </div>
    </Panel>
  )
}

function Launcher() {
  const { apps } = useData()
  const list = apps.data?.apps ?? []
  const online = !!apps.data?.online
  const running = list.filter((a) => a.running).length
  return (
    <Panel area="1 / 2 / 3 / 5" label="LAUNCH"
      aside={!apps.data ? 'CONNECTING…' : online ? `${list.length} APPS · ${running} RUN` : 'PC OFFLINE'}>
      {online ? (
        <div className="scroll">
          <div className="apps">
            {list.map((a) => <AppTile key={a.key} app={a} onDone={() => apps.refresh(2500)} />)}
          </div>
        </div>
      ) : (
        <div className="faint" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          {apps.data ? 'AGENT UNREACHABLE — IS THE PC AWAKE?' : '…'}
        </div>
      )}
    </Panel>
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
  const name = app.label ?? app.key
  return (
    <div className={'app' + (app.running ? ' run' : '') + (state === 'err' ? ' err' : '')} onClick={() => act('/deck/launch')}>
      {app.running && <Led up />}
      {icon
        ? <img src={icon} alt="" draggable={false} />
        : <span className="badge">{name.slice(0, 1).toUpperCase()}</span>}
      <span className="nm ellipsis">{state === 'busy' ? '…' : state === 'ok' ? 'SENT' : state === 'err' ? 'ERR' : name}</span>
      {app.running && app.closable && (
        <button className="x" aria-label={`Close ${name}`} onClick={(e) => { e.stopPropagation(); act('/deck/close') }}>×</button>
      )}
    </div>
  )
}
