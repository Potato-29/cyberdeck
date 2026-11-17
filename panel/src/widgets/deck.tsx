import { useState } from 'react'
import { call, isUp, num } from '../api'
import { useData } from '../data'
import { opt } from '../types'
import { useConfirm } from '../ui/Confirm'
import { Ring } from '../ui/Ring'
import { useToast } from '../ui/Toast'
import type { WidgetProps } from './types'

// Stopping either of these cuts the panel off from the hub, so ask first
// (same rule as hud/ CORE).
const RISKY = new Set(['cloudflared', 'webhook'])

export function Services({ w, spec }: WidgetProps) {
  const { dash } = useData()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const states = dash.data?.services ?? {}
  const labels = Object.fromEntries((dash.data?.service_meta ?? []).map((m) => [m.key, m.label]))
  const controls = opt<boolean>(w, spec, 'controls')
  // Down services float to the top.
  const keys = Object.keys(states).sort((a, b) => Number(isUp(states[a])) - Number(isUp(states[b])))
  const up = keys.filter((k) => isUp(states[k])).length

  const toggle = async (k: string) => {
    const running = isUp(states[k])
    if (running && RISKY.has(k) && !(await confirm({
      title: `Stop ${labels[k] ?? k}?`, body: 'The panel reaches the deck through it and will lose its connection.', action: 'Stop', danger: true,
    }))) return
    setBusy(k)
    try {
      await call(running ? '/stop' : '/restart', { service: k })
      toast(`${labels[k] ?? k} ${running ? 'stopped' : 'started'}`, { level: 'ok' })
    } catch (e) {
      toast(labels[k] ?? k, { text: (e as Error).message, level: 'error', seconds: 4 })
    } finally {
      setBusy('')
      dash.refresh(800)
    }
  }

  return (
    <div className="svc">
      <div className="w-head"><span>Services</span><span className={up === keys.length ? 'ok' : 'bad'}>{up}/{keys.length} up</span></div>
      <div className="svc-list">
        {keys.map((k) => (
          <div key={k} className="svc-row">
            <span className={'dot ' + (isUp(states[k]) ? 'ok' : 'bad')} />
            <span className="svc-n">{labels[k] ?? k}</span>
            {controls && (
              <button className="chip" disabled={busy === k} onClick={() => toggle(k)}>
                {busy === k ? '…' : isUp(states[k]) ? 'Stop' : 'Start'}
              </button>
            )}
          </div>
        ))}
        {!keys.length && <div className="empty">{dash.error ? 'Hub unreachable' : 'Loading…'}</div>}
      </div>
    </div>
  )
}

export function Battery() {
  const { dash } = useData()
  const b = dash.data?.battery
  const lvl = num(b?.level)
  const color = lvl == null ? '#8e8e93' : lvl < 20 ? '#ff453a' : lvl < 40 ? '#ffd60a' : '#4ade80'
  const charging = /charg/i.test(b?.status ?? '') && !/not|dis/i.test(b?.status ?? '')
  return (
    <div className="row-w">
      <div className="row-ring"><Ring frac={(lvl ?? 0) / 100} color={color} width={11}><span className="row-ring-ic">{charging ? '⚡' : '🔋'}</span></Ring></div>
      <div>
        <div className="row-l">Phone battery</div>
        <div className="row-v">{lvl ?? '–'}<small>%</small></div>
        <div className="dim">{[b?.status?.toLowerCase(), b?.temperature != null ? Math.round(b.temperature) + '°C' : ''].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  )
}

export function Wifi() {
  const { dash } = useData()
  const wf = dash.data?.wifi
  const rssi = num(wf?.rssi)
  const bars = rssi == null ? 0 : rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1
  return (
    <div className="row-w">
      <div className="bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= bars ? 'on' : ''} style={{ height: 25 * i + '%' }} />)}</div>
      <div className="clip">
        <div className="row-l">Wi-Fi</div>
        <div className="row-v sm clip">{wf?.ssid ?? '–'}</div>
        <div className="dim clip">{[rssi != null ? rssi + ' dBm' : '', wf?.speed_mbps ? wf.speed_mbps + ' Mbps' : '', wf?.ip].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  )
}

export function System() {
  const { dash } = useData()
  const s = dash.data?.system
  const rows: [string, string | undefined][] = [['Uptime', s?.uptime], ['Storage', s?.disk], ['Memory', s?.memory]]
  return (
    <div className="kv">
      <div className="w-head"><span>Deck</span></div>
      {rows.map(([k, v]) => <div key={k} className="kv-row"><span className="dim">{k}</span><span className="clip">{v ?? '–'}</span></div>)}
    </div>
  )
}
