import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { call, isUp } from '../api'
import { useData } from '../data'
import { Num } from '../fx/AnimatedNumber'
import { Ring } from '../fx/Ring'
import { Chip } from '../ui/Chip'
import { IcBell, IcBellOff, IcBolt, IcPaw, IcServer, IcWifi } from '../ui/icons'
import { useConfirm } from '../ui/Sheet'
import { Tile } from '../ui/Tile'

// Stopping either of these can strand the panel remotely: cloudflared carries
// the tunnel, webhook is the process serving this page. Speed bump, not a block.
const STOP_CONFIRM = new Set(['cloudflared', 'webhook'])

export function CorePage() {
  return (
    <>
      <Services />
      <Battery />
      <Wifi />
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
  // Down services float to the top; layout animation makes the move visible.
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
    <Tile id="services" area="1 / 1 / 3 / 3" icon={<IcServer />} title="Services"
      aside={rows.length ? <span><span style={{ color: up === rows.length ? 'var(--green)' : 'var(--red)' }}>{up}</span>/{rows.length} up</span> : null}>
      <div className="scroll-y" style={{ margin: '0 -8px', padding: '0 8px 12px' }}>
        <AnimatePresence initial={false}>
          {sorted.map((s, i) => {
            const running = isUp(svcs[s.key])
            return (
              <m.div key={s.key} layout layoutDependency={i} transition={{ type: 'spring', stiffness: 400, damping: 36 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <StatusDot up={running} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: running ? 'var(--text)' : 'var(--red)' }}>
                  {s.label}
                </span>
                <Chip small onRun={() => alert(s.key, s.alert)} okLabel={s.alert ? <IcBellOff /> : <IcBell />}
                  className={s.alert ? '' : 'muted'} title={s.alert ? 'Alerts on — tap to mute' : 'Alerts muted — tap to unmute'}>
                  {s.alert ? <IcBell /> : <IcBellOff />}
                </Chip>
                <Chip small onRun={() => toggle(s.key, running)} className={running ? 'danger' : 'ok'}
                  okLabel={running ? 'Stopped' : 'Started'}>
                  {running ? 'Stop' : 'Start'}
                </Chip>
              </m.div>
            )
          })}
        </AnimatePresence>
        {!rows.length && <div className="faint small" style={{ padding: '8px 0' }}>{dash.error ? 'Hub unreachable' : 'Loading…'}</div>}
      </div>
    </Tile>
  )
}

/** Green/red dot; a down service gets a CSS ripple (theme.css → .ripple). */
export function StatusDot({ up }: { up: boolean }) {
  return (
    <span className={'status-dot' + (up ? '' : ' ripple')}
      style={{ background: up ? 'var(--green)' : 'var(--red)' }} />
  )
}

// termux-battery-status values → short labels that fit a quarter-width tile.
const BATTERY_STATUS: Record<string, string> = {
  CHARGING: 'Charging', DISCHARGING: 'On battery', NOT_CHARGING: 'Plugged in', FULL: 'Full',
}

function Battery() {
  const b = useData().dash.data?.battery ?? {}
  const lvl = b.level ?? null
  const color = lvl == null ? 'var(--text-3)' : lvl <= 15 ? 'var(--red)' : lvl <= 25 ? 'var(--orange)' : 'var(--green)'
  const status = (b.status ?? '').toUpperCase()
  const charging = status === 'CHARGING'
  const label = BATTERY_STATUS[status] ?? (status ? status.toLowerCase().replace(/_/g, ' ') : '–')
  return (
    <Tile id="battery" area="1 / 3 / 2 / 4" icon={<IcBolt />} title="Battery" accent={color}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minHeight: 0, minWidth: 0 }}>
        <Ring value={lvl} color={color} size={72} stroke={8}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AnimatePresence>
              {charging && (
                <m.span initial={{ scale: 0, width: 0 }} animate={{ scale: 1, width: 'auto' }} exit={{ scale: 0, width: 0 }}
                  style={{ color, display: 'inline-flex' }}>
                  <IcBolt width={12} height={12} />
                </m.span>
              )}
            </AnimatePresence>
            <Num value={lvl} unit="%" className="mid" />
          </div>
        </Ring>
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div className="small ellipsis" style={{ fontWeight: 600, textTransform: 'capitalize' }}>{label}</div>
          <div className="tiny dim ellipsis" style={{ marginTop: 4 }}><Num value={b.temperature} decimals={1} unit="°C" /></div>
          <div className="tiny faint ellipsis" style={{ marginTop: 2, textTransform: 'capitalize' }}>{(b.health ?? '').toLowerCase()}</div>
        </div>
      </div>
    </Tile>
  )
}

function Wifi() {
  const w = useData().dash.data?.wifi ?? {}
  // RSSI → 0..4 bars, roughly Android's own thresholds.
  const bars = w.rssi == null ? 0 : w.rssi >= -55 ? 4 : w.rssi >= -66 ? 3 : w.rssi >= -77 ? 2 : 1
  return (
    <Tile id="wifi" area="1 / 4 / 2 / 5" icon={<IcWifi />} title="Wi-Fi" accent="var(--blue)">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 30 }}>
        {[1, 2, 3, 4].map((i) => (
          <m.span key={i}
            style={{ width: 7, height: 6 + i * 6, borderRadius: 3, transformOrigin: 'bottom' }}
            animate={{ backgroundColor: i <= bars ? 'var(--blue)' : 'var(--tile-2)', scaleY: i <= bars ? 1 : 0.85 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.05 }} />
        ))}
        <span style={{ marginLeft: 'auto' }} className="small dim"><Num value={w.rssi} unit="dBm" /></span>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontWeight: 600, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {w.ssid && w.ssid !== '--' ? w.ssid.replace(/^"|"$/g, '') : '–'}
        </div>
        <div className="tiny dim num">{w.ip ?? '–'} · <Num value={w.speed_mbps} unit="Mbps" /></div>
      </div>
    </Tile>
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
    <Tile id="control" area="2 / 3 / 3 / 5" icon={<IcPaw />} title="Control">
      <div className="tiny faint" style={{ fontWeight: 600, marginBottom: 6 }}>Quick actions</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(actions.data ?? []).map((a) => (
          <Chip key={a.key} onRun={() => run(a.key, a.label, a.confirm)} className={a.confirm ? 'danger' : ''}>{a.label}</Chip>
        ))}
        {!actions.data && <span className="tiny faint">{actions.error ? 'Actions unavailable' : 'Loading…'}</span>}
      </div>
      <div className="tiny faint" style={{ fontWeight: 600, margin: '10px 0 6px' }}>Cat feeder</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Chip onRun={() => feeder('/feed')} disabled={feederBusy} className="ok">Feed now</Chip>
        <Chip onRun={() => feeder('/door-open')} disabled={feederBusy}>Open door</Chip>
        <Chip onRun={() => feeder('/door-close')} disabled={feederBusy}>Close</Chip>
      </div>
    </Tile>
  )
}
