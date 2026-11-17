import { useState, type CSSProperties } from 'react'
import { call } from '../api'
import { usePanel } from '../ctx'
import { useData } from '../data'
import { opt } from '../types'
import { useConfirm } from '../ui/Confirm'
import { KeyButton } from '../ui/KeyButton'
import { useToast } from '../ui/Toast'
import type { WidgetProps } from './types'

const grid = (cols: number, n: number): CSSProperties => ({
  gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${Math.max(1, Math.ceil(n / Math.max(1, cols)))}, minmax(0, 1fr))`,
})

export function Keys({ w, spec }: WidgetProps) {
  const { config } = usePanel()
  const pick = opt<string[]>(w, spec, 'keys') ?? []
  const keys = pick.length ? pick.map((id) => config.shortcuts.find((k) => k.id === id)).filter((k) => !!k) : config.shortcuts
  const cols = Number(opt<number>(w, spec, 'columns')) || 3
  if (!keys.length) return <div className="empty tile-like">Add shortcuts in the editor</div>
  return (
    <div className="keys" style={grid(cols, keys.length)}>
      {keys.map((k) => <KeyButton key={k.id} k={k} />)}
    </div>
  )
}

export function Button({ w, spec }: WidgetProps) {
  const { config } = usePanel()
  const k = config.shortcuts.find((s) => s.id === opt<string>(w, spec, 'key'))
  if (!k) return <div className="empty tile-like">Pick a shortcut in the editor</div>
  return <div className="keys one"><KeyButton k={k} big /></div>
}

export function Launcher({ w, spec }: WidgetProps) {
  const { apps } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const list = apps.data?.apps ?? []
  const cols = Number(opt<number>(w, spec, 'columns')) || 4
  if (!apps.data?.online) return <div className="empty tile-like">{apps.data ? 'PC agent offline' : 'Loading…'}</div>
  const launch = async (key: string, label: string) => {
    setBusy(key)
    try {
      await call('/deck/launch', { app: key })
      toast(label + ' launched', { level: 'ok' })
    } catch (e) {
      toast(label, { text: (e as Error).message, level: 'error', seconds: 4 })
    } finally {
      setBusy('')
      apps.refresh(1500)
    }
  }
  return (
    <div className="keys" style={grid(cols, list.length)}>
      {list.map((a) => (
        <button
          key={a.key}
          className={'key' + (busy === a.key ? ' busy' : '') + (a.running ? ' lit' : '')}
          style={{ '--k': a.running ? '#30d158' : '#8e8e93' } as CSSProperties}
          onClick={() => launch(a.key, a.label ?? a.key)}
        >
          {a.icon && <span className="key-ic">{a.icon}</span>}
          <span className="key-l">{a.label ?? a.key}</span>
          {a.running && <span className="key-dot" />}
        </button>
      ))}
    </div>
  )
}

export function Feeder() {
  const { feeder } = useData()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const online = feeder.data?.status === 'online'
  const feed = async () => {
    if (!(await confirm({ title: '🐱 Feed the cat?', body: 'Drops one portion now.', action: 'Feed' }))) return
    setBusy(true)
    try {
      const r = await call('/feed')
      toast('Fed', { text: r.feed_count != null ? `Feed #${r.feed_count}` : undefined, level: 'ok' })
    } catch (e) {
      toast('Feeder', { text: (e as Error).message, level: 'error', seconds: 5 })
    } finally {
      setBusy(false)
      feeder.refresh(500)
    }
  }
  return (
    <div className="row-w">
      <button className={'key big' + (busy ? ' busy' : '')} style={{ '--k': '#ffd60a', flex: '0 0 45%' } as CSSProperties} disabled={busy} onClick={feed}>
        <span className="key-ic">🐱</span><span className="key-l">{busy ? 'Feeding…' : 'Feed'}</span>
      </button>
      <div className="clip">
        <div className="row-l">Cat feeder</div>
        <div className={online ? 'ok' : 'bad'}>{feeder.data ? (online ? '● online' : '● offline') : '…'}</div>
      </div>
    </div>
  )
}
