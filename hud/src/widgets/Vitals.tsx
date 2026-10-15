import { splitReading } from '../api'
import { useData } from '../data'
import { Num } from '../fx/AnimatedNumber'
import { Bar, level, Ring } from '../fx/Ring'
import { IcChip, IcClock, IcMonitor } from '../ui/icons'
import { Tile } from '../ui/Tile'

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
  const cpuT = splitReading(pc?.cpu_temp)
  const gpuT = splitReading(pc?.gpu_temp)
  const ram = splitReading(pc?.ram_load)
  const fan = splitReading(pc?.cpu_fan)

  return (
    <Tile id="pc" area="1 / 1 / 3 / 3" icon={<IcMonitor />} title="PC"
      accent={online ? 'var(--purple)' : undefined}
      aside={online ? <span style={{ color: 'var(--green)' }}>● online</span> : 'offline'}>
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1, minHeight: 0, opacity: online ? 1 : 0.35, transition: 'opacity .4s' }}>
        {[{ k: 'CPU', v: cpu, t: cpuT, c: 'var(--purple)' }, { k: 'GPU', v: gpu, t: gpuT, c: 'var(--teal)' }].map((g) => (
          <div key={g.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Ring value={online ? g.v.n : null} color={level(g.v.n, 50, 80, g.c)} size={118} stroke={11}>
              <div style={{ textAlign: 'center' }}>
                <Num value={online ? g.v.n : null} unit="%" className="big" />
                <div className="tiny dim" style={{ fontWeight: 600, marginTop: 2 }}>{g.k}</div>
              </div>
            </Ring>
            <span className="small" style={{ color: level(g.t.n, 70, 85, 'var(--text-2)'), fontWeight: 600 }}>
              <Num value={online ? g.t.n : null} decimals={0} unit="°C" />
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', alignItems: 'center', opacity: online ? 1 : 0.35 }}>
        <div>
          <div className="kv" style={{ padding: '0 0 4px' }}><span>Memory</span><span><Num value={online ? ram.n : null} unit="%" /></span></div>
          <Bar value={online ? ram.n : null} color={level(ram.n, 50, 80, 'var(--blue)')} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tiny dim">Fan</div>
          <div style={{ fontWeight: 600 }}><Num value={online ? fan.n : null} unit="rpm" /></div>
        </div>
      </div>
    </Tile>
  )
}

function Resources() {
  const r = useData().dash.data?.resources ?? {}
  const items = [
    { k: 'CPU', v: r.cpu ?? null, c: 'var(--green)' },
    { k: 'RAM', v: r.mem_pct ?? null, c: 'var(--blue)' },
    { k: 'Disk', v: r.disk_pct ?? null, c: 'var(--orange)' },
  ]
  return (
    <Tile id="resources" area="1 / 3 / 2 / 5" icon={<IcChip />} title="Deck resources">
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1, minHeight: 0 }}>
        {items.map((i) => (
          <div key={i.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Ring value={i.v} color={level(i.v, 60, 85, i.c)} size={70} stroke={7}>
              <Num value={i.v} unit="%" style={{ fontWeight: 600, fontSize: 17 }} />
            </Ring>
            <div className="small dim" style={{ fontWeight: 600 }}>{i.k}</div>
          </div>
        ))}
      </div>
    </Tile>
  )
}

function SystemInfo() {
  const s = useData().dash.data?.system ?? {}
  return (
    <Tile id="system" area="2 / 3 / 3 / 5" icon={<IcClock />} title="System">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minHeight: 0 }}>
        <div>
          <div className="tiny dim" style={{ fontWeight: 600 }}>Uptime</div>
          <div className="big num" style={{ fontSize: 34 }}>{s.uptime ?? '–'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--line)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Stat label="Storage" value={trimUsage(s.disk)} />
          <Stat label="Memory" value={trimUsage(s.memory)} />
        </div>
      </div>
    </Tile>
  )
}

// "41G/110G (38% used)" → "41G / 110G" — the % already lives in Deck resources.
function trimUsage(v?: string) {
  if (!v || v === '--') return '–'
  return v.replace(/\s*\(.*\)\s*$/, '').replace(/\s*used$/, '').replace('/', ' / ')
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="tiny dim" style={{ fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
