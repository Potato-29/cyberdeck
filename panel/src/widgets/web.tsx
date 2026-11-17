import { useForza } from '../hooks/useForza'
import { useData } from '../data'
import { opt, type Pushed } from '../types'
import { Ring } from '../ui/Ring'
import { wxIcon } from './time'
import type { WidgetProps } from './types'

export function Weather() {
  const { dash } = useData()
  const wx = dash.data?.weather
  if (!wx || wx.temp == null) return <div className="empty">{dash.data ? 'No weather' : 'Loading…'}</div>
  return (
    <div className="row-w">
      <span className="wx-ic">{wxIcon(wx.description)}</span>
      <div>
        <div className="row-v">{wx.temp}°</div>
        <div className="clip">{wx.description}</div>
        <div className="dim">Feels {wx.feels_like}° · {wx.humidity}% humidity</div>
      </div>
    </div>
  )
}

const ago = (s: string) => {
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}

export function News({ w, spec }: WidgetProps) {
  const { dash } = useData()
  const items = (dash.data?.rss ?? []).slice(0, Number(opt<number>(w, spec, 'count')) || 5)
  return (
    <div className="list-w">
      <div className="w-head"><span>News</span></div>
      <div className="list-items">
        {items.map((it) => (
          <a key={it.link} className="list-row" href={it.link} target="_blank" rel="noopener noreferrer">
            <span className="clip2">{it.title}</span><span className="dim">{ago(it.published)}</span>
          </a>
        ))}
        {!items.length && <div className="empty">{dash.data ? 'No headlines' : 'Loading…'}</div>}
      </div>
    </div>
  )
}

export function Forza() {
  const t = useForza()
  if (!t) {
    return <div className="empty">{location.protocol === 'https:' ? 'Forza needs the LAN address (ws:// is blocked over https)' : 'Waiting for Forza…'}</div>
  }
  return (
    <div className="forza">
      <div><div className="row-l">Speed</div><div className="forza-v">{t.speed}<small>km/h</small></div></div>
      <div><div className="row-l">Gear</div><div className="forza-v gear">{t.gear}</div></div>
      <div><div className="row-l">RPM</div><div className="forza-v">{t.rpm}</div></div>
    </div>
  )
}

const LEVEL_COLOR: Record<string, string> = { ok: '#30d158', warn: '#ffd60a', error: '#ff453a', info: '#64d2ff' }

/** Colour by explicit level, or by well-known words (PhoneBox colours passed/failed/running). */
function levelOf(p: Pushed): string | undefined {
  if (p.level) return p.level
  const v = String(p.value ?? '').toLowerCase()
  if (/^(ok|pass(ed)?|success|up|online|on|live|done|green)$/.test(v)) return 'ok'
  if (/^(fail(ed)?|error|down|offline|red|broken)$/.test(v)) return 'error'
  if (/^(running|pending|building|warn(ing)?|busy|queued)$/.test(v)) return 'warn'
  return undefined
}

export function PushedValue({ w, spec }: WidgetProps) {
  const { push } = useData()
  const key = opt<string>(w, spec, 'key')
  const style = opt<string>(w, spec, 'style')
  const p = push.data?.[key]
  const title = opt<string>(w, spec, 'label') || p?.title || key
  if (!p) {
    return (
      <div className="pushed">
        <div className="row-l">{title}</div>
        <div className="empty sm">No value yet — POST /panel/push/{key}</div>
      </div>
    )
  }
  const lv = levelOf(p)
  const color = p.color || (lv ? LEVEL_COLOR[lv] : '#e5e5ea')

  if (style === 'list' && Array.isArray(p.items)) {
    return (
      <div className="list-w">
        <div className="w-head"><span>{p.icon} {title}</span></div>
        <div className="list-items">
          {p.items.map((it, i) => {
            const o = typeof it === 'string' ? { label: it } : it
            return (
              <div key={i} className="list-row">
                <span className="clip">{o.label}</span>
                {o.value != null && <b style={{ color: o.level ? LEVEL_COLOR[o.level] : undefined }}>{String(o.value)}</b>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const value = <span className="pushed-v" style={{ color }}>{String(p.value ?? '–')}<small>{p.unit}</small></span>
  if (style === 'gauge') {
    const f = p.progress ?? (typeof p.value === 'number' ? p.value / 100 : 0)
    return (
      <div className="gauge">
        <Ring frac={f} color={color}>{value}</Ring>
        <div className="gauge-l">{p.icon} {title}</div>
        {p.sub && <div className="gauge-s dim">{p.sub}</div>}
      </div>
    )
  }
  return (
    <div className="pushed">
      <div className="row-l">{p.icon} {title}</div>
      {value}
      {p.sub && <div className="dim clip">{p.sub}</div>}
      {p.progress != null && <div className="media-prog"><i style={{ width: p.progress * 100 + '%', background: color }} /></div>}
    </div>
  )
}

export function Notifications({ w, spec }: WidgetProps) {
  const { notes } = useData()
  const list = notes.slice(-(Number(opt<number>(w, spec, 'count')) || 6)).reverse()
  return (
    <div className="list-w">
      <div className="w-head"><span>Notifications</span></div>
      <div className="list-items">
        {list.map((n) => (
          <div key={n.seq} className="note-row">
            <span className="dot" style={{ background: LEVEL_COLOR[n.level ?? 'info'] }} />
            <div className="clip">
              <div className="clip">{n.title || n.text}</div>
              {n.title && n.text && <div className="dim clip">{n.text}</div>}
            </div>
            <span className="dim">{new Date(n.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        {!list.length && <div className="empty">Nothing yet — POST /panel/notify</div>}
      </div>
    </div>
  )
}
