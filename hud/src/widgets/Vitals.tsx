import { splitReading } from '../api'
import { useData } from '../data'
import { level, Meter } from '../ui/Meter'
import { Led, Panel } from '../ui/Panel'
import { Val } from '../ui/Value'

export function VitalsPage() {
  return (
    <>
      <PcVitals />
      <Resources />
      <SystemInfo />
    </>
  )
}

function PcVitals() {
  const pc = useData().dash.data?.pc_stats
  const online = !!pc?.online
  const cpu = splitReading(pc?.cpu_load)
  const gpu = splitReading(pc?.gpu_load)
  const ram = splitReading(pc?.ram_load)
  const fan = splitReading(pc?.cpu_fan)
  const cols = [
    { k: 'CPU', load: cpu.n, temp: splitReading(pc?.cpu_temp).n },
    { k: 'GPU', load: gpu.n, temp: splitReading(pc?.gpu_temp).n },
  ]

  return (
    <Panel area="1 / 1 / 3 / 3" label="PC"
      aside={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Led up={online} />{online ? 'ONLINE' : 'OFFLINE'}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, opacity: online ? 1 : 0.35 }}>
        <div style={{ display: 'flex', gap: 18, flex: 1, minHeight: 0 }}>
          {cols.map((c) => {
            const load = online ? c.load : null
            return (
              <div key={c.k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                <div className="lbl">{c.k}</div>
                <div className="big" style={{ fontSize: 46 }}><Val v={load} unit="%" /></div>
                <Meter value={load} n={20} color={level(load, 50, 80)} tall />
                <div className="kv" style={{ padding: 0 }}>
                  <span>TEMP</span>
                  <span style={{ color: level(online ? c.temp : null, 70, 85, 'var(--text)') }}><Val v={online ? c.temp : null} unit="°C" /></span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mrow" style={{ marginTop: 6 }}>
          <span className="lbl">RAM</span>
          <Meter value={online ? ram.n : null} n={20} color={level(ram.n, 50, 80)} />
          <span className="mv"><Val v={online ? ram.n : null} unit="%" /></span>
        </div>
        <div className="kv" style={{ marginTop: 4 }}><span>FAN</span><span><Val v={online ? fan.n : null} unit="rpm" /></span></div>
      </div>
    </Panel>
  )
}

function Resources() {
  const r = useData().dash.data?.resources ?? {}
  const items = [
    { k: 'CPU', v: r.cpu ?? null },
    { k: 'RAM', v: r.mem_pct ?? null },
    { k: 'DSK', v: r.disk_pct ?? null },
  ]
  return (
    <Panel area="1 / 3 / 2 / 5" label="DECK">
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, minHeight: 0 }}>
        {items.map((i) => (
          <div className="mrow" key={i.k}>
            <span className="lbl">{i.k}</span>
            <Meter value={i.v} n={16} color={level(i.v, 60, 85)} />
            <span className="mv"><Val v={i.v} unit="%" /></span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// "41G/110G (38% used)" → "41G / 110G" — the % already lives in DECK.
function trimUsage(v?: string) {
  if (!v || v === '--') return '–'
  return v.replace(/\s*\(.*\)\s*$/, '').replace(/\s*used$/, '').replace('/', ' / ')
}

function SystemInfo() {
  const s = useData().dash.data?.system ?? {}
  return (
    <Panel area="2 / 3 / 3 / 5" label="SYS">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minHeight: 0 }}>
        <div>
          <div className="lbl">UPTIME</div>
          <div className="big num" style={{ fontSize: 28, marginTop: 6 }}>{s.uptime ?? '–'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--line)', paddingLeft: 14 }}>
          <div className="lbl" style={{ marginBottom: 2 }}>STORAGE</div>
          <div className="mid num ellipsis" style={{ marginBottom: 10 }}>{trimUsage(s.disk)}</div>
          <div className="lbl" style={{ marginBottom: 2 }}>MEMORY</div>
          <div className="mid num ellipsis">{trimUsage(s.memory)}</div>
        </div>
      </div>
    </Panel>
  )
}
