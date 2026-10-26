import { useState } from 'react'
import { call, isUp } from '../api'
import { useData } from '../data'
import { Key } from '../ui/Key'
import { Meter } from '../ui/Meter'
import { Led, Panel } from '../ui/Panel'
import { useConfirm } from '../ui/Sheet'
import { Val } from '../ui/Value'

// Stopping either of these can strand the panel remotely: cloudflared carries
// the tunnel, webhook is the process serving this page. Speed bump, not a block.
const STOP_CONFIRM = new Set(['cloudflared', 'webhook'])

export function CorePage() {
  return (
    <>
      <Services />
      <Battery />
      <Net />
      <Control />
    </>
  )
}

function Services() {
  const { dash } = useData()
  const confirm = useConfirm()
  const svcs = dash.data?.services ?? {}
  const meta = dash.data?.service_meta ?? Object.keys(svcs).map((k) => ({ key: k, label: k, alert: true }))
  const rows = meta.filter((m) => svcs[m.key] !== undefined)
  // Down services float to the top.
  const sorted = [...rows].sort((a, b) => Number(isUp(svcs[a.key])) - Number(isUp(svcs[b.key])))
  const up = rows.filter((r) => isUp(svcs[r.key])).length

  const toggle = async (key: string, running: boolean) => {
    if (running && STOP_CONFIRM.has(key)) {
      await confirm({
        title: `Stop ${key}?`,
        body: 'This may disconnect this panel remotely — you would need SSH or physical access to bring it back.',
        action: 'Stop', danger: true,
      })
    }
    await call(running ? '/stop' : '/restart', { service: key })
    dash.refresh(1000)
  }
  const alert = async (key: string, on: boolean) => {
    await call('/service/alert', { service: key, enabled: !on })
    dash.refresh(400)
  }

  return (
    <Panel area="1 / 1 / 3 / 3" label="SVC"
      aside={rows.length ? <span className={up === rows.length ? undefined : 'bad'}>{String(up).padStart(2, '0')}/{String(rows.length).padStart(2, '0')}</span> : null}>
      <div className="scroll">
        {sorted.map((s) => {
          const running = isUp(svcs[s.key])
          return (
            <div className="row" key={s.key}>
              <Led up={running} />
              <span className={'name ellipsis' + (running ? '' : ' bad')}>{s.label}</span>
              <span className={'code' + (running ? '' : ' bad')}>{running ? 'RUN' : 'DN'}</span>
              <Key small tone={s.alert ? 'acc' : 'dim'} onRun={() => alert(s.key, s.alert)}
                title={s.alert ? 'Alerts on — tap to mute' : 'Alerts muted — tap to unmute'}>
                {s.alert ? 'ALRT' : 'MUTE'}
              </Key>
              <Key small tone={running ? 'bad' : 'ok'} onRun={() => toggle(s.key, running)}>
                {running ? 'STOP' : 'START'}
              </Key>
            </div>
          )
        })}
        {!rows.length && <div className="faint" style={{ padding: '8px 0' }}>{dash.error ? 'HUB UNREACHABLE' : 'LOADING…'}</div>}
      </div>
    </Panel>
  )
}

// termux-battery-status values → short codes that fit a quarter-width panel.
const BATTERY_CODE: Record<string, string> = {
  CHARGING: 'CHG', DISCHARGING: 'DISCHG', NOT_CHARGING: 'PLUG', FULL: 'FULL',
}

function Battery() {
  const b = useData().dash.data?.battery ?? {}
  const lvl = b.level ?? null
  const color = lvl == null ? 'var(--faint)' : lvl <= 15 ? 'var(--bad)' : lvl <= 25 ? 'var(--warn)' : 'var(--ok)'
  const status = (b.status ?? '').toUpperCase()
  const code = BATTERY_CODE[status] ?? (status ? status.slice(0, 6) : '–')
  return (
    <Panel area="1 / 3 / 2 / 4" label="BAT" aside={<span style={{ color }}>{code}</span>}>
      <div className="big" style={{ color: lvl != null && lvl <= 25 ? color : undefined }}><Val v={lvl} unit="%" /></div>
      <div style={{ margin: '10px 0 6px' }}><Meter value={lvl} n={10} color={color} tall /></div>
      <div className="kv"><span>TEMP</span><span><Val v={b.temperature} dec={1} unit="°C" /></span></div>
      <div className="kv"><span>HEALTH</span><span>{(b.health ?? '–').toUpperCase()}</span></div>
    </Panel>
  )
}

function Net() {
  const w = useData().dash.data?.wifi ?? {}
  // RSSI → 0..4 bars, roughly Android's own thresholds.
  const bars = w.rssi == null ? 0 : w.rssi >= -55 ? 4 : w.rssi >= -66 ? 3 : w.rssi >= -77 ? 2 : 1
  const ssid = w.ssid && w.ssid !== '--' ? w.ssid.replace(/^"|"$/g, '') : '–'
  return (
    <Panel area="1 / 4 / 2 / 5" label="NET" aside={<Val v={w.rssi} unit="dBm" flash={false} />}>
      <div style={{ width: 54 }}><Meter value={(bars / 4) * 100} n={4} steps color="var(--acc)" /></div>
      <div style={{ marginTop: 'auto' }}>
        <div className="mid ellipsis">{ssid}</div>
        <div className="kv"><span>IP</span><span>{w.ip ?? '–'}</span></div>
        <div className="kv"><span>LINK</span><span><Val v={w.speed_mbps} unit="Mb/s" /></span></div>
      </div>
    </Panel>
  )
}

function Control() {
  const { actions } = useData()
  const confirm = useConfirm()
  const [feederBusy, setFeederBusy] = useState(false)

  const run = async (key: string, label: string, needsConfirm: boolean) => {
    if (needsConfirm) {
      await confirm({ title: `Run ${label}?`, body: 'This may briefly interrupt the panel.', action: 'Run', danger: true })
    }
    await call('/action/run', { action: key })
  }
  const feeder = async (path: string) => {
    setFeederBusy(true)
    try { await call(path, {}, 'GET') } finally { setFeederBusy(false) }
  }

  return (
    <Panel area="2 / 3 / 3 / 5" label="ACT">
      <div className="sub">QUICK</div>
      <div className="keys">
        {(actions.data ?? []).map((a) => (
          <Key key={a.key} tone={a.confirm ? 'bad' : ''} onRun={() => run(a.key, a.label, a.confirm)}>{a.label.toUpperCase()}</Key>
        ))}
        {!actions.data && <span className="faint">{actions.error ? 'UNAVAILABLE' : 'LOADING…'}</span>}
      </div>
      <div className="sub">CAT FEEDER</div>
      <div className="keys">
        <Key tone="ok" onRun={() => feeder('/feed')} disabled={feederBusy}>FEED</Key>
        <Key onRun={() => feeder('/door-open')} disabled={feederBusy}>DOOR OPEN</Key>
        <Key onRun={() => feeder('/door-close')} disabled={feederBusy}>DOOR CLOSE</Key>
      </div>
    </Panel>
  )
}
