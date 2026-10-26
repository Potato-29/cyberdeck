import { useState } from 'react'
import { useData } from '../data'
import { useForza } from '../hooks/useForza'
import { level, Meter } from '../ui/Meter'
import { Panel } from '../ui/Panel'
import { Modal } from '../ui/Sheet'
import { Val } from '../ui/Value'

export function PeriphPage() {
  return (
    <>
      <Weather />
      <Forza />
      <News />
    </>
  )
}

function Weather() {
  const w = useData().dash.data?.weather ?? {}
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
  return (
    <Panel area="1 / 1 / 2 / 3" label="WX · AHMEDABAD" aside={date}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minHeight: 0 }}>
        <div className="big" style={{ fontSize: 46 }}><Val v={w.temp} unit="°C" /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mid ellipsis" style={{ textTransform: 'uppercase', fontSize: 14, letterSpacing: '0.02em' }}>{w.description ?? '–'}</div>
          <div className="kv"><span>FEELS</span><span><Val v={w.feels_like} unit="°C" /></span></div>
          <div className="kv"><span>HUMIDITY</span><span><Val v={w.humidity} unit="%" /></span></div>
        </div>
      </div>
    </Panel>
  )
}

function Forza() {
  const t = useForza()
  // Redline varies per car; this is a feel meter, not a tach.
  const rev = t ? Math.min(100, (t.rpm / 8000) * 100) : null
  return (
    <Panel area="2 / 1 / 3 / 3" label="FORZA"
      aside={<a href="https://race.prayas.space" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)' }}>HUD ›</a>}>
      {t ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, justifyContent: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <div className="big" style={{ fontSize: 46, color: 'var(--acc)' }}>{t.gear}</div>
            <div className="big"><Val v={t.speed} unit="km/h" flash={false} /></div>
            <div className="mid dim" style={{ marginLeft: 'auto' }}><Val v={t.rpm} unit="rpm" flash={false} /></div>
          </div>
          <Meter value={rev} n={24} color={level(rev, 75, 92)} tall />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="mid faint">NO SIGNAL</div>
            <div className="faint" style={{ marginTop: 4, fontSize: 10, letterSpacing: '0.1em' }}>
              {location.protocol === 'https:' ? 'LIVE LINK WORKS ON THE LAN ONLY' : 'WAITING FOR THE GAME…'}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function News() {
  const items = useData().dash.data?.rss ?? []
  const [open, setOpen] = useState(false)
  const list = items.slice(0, 10).map((it) => (
    <a className="news-item" key={it.link + it.title} href={it.link} target="_blank" rel="noreferrer">
      <div className="d">{it.published}</div>
      <div className="t">{it.title}</div>
    </a>
  ))
  const empty = <div className="faint" style={{ padding: '8px 0' }}>NO FEED DATA</div>
  return (
    <>
      <Panel area="1 / 3 / 3 / 5" label="NEWS" onExpand={() => setOpen(true)}>
        <div className="scroll">{items.length ? list : empty}</div>
      </Panel>
      <Modal open={open} onClose={() => setOpen(false)} wide>
        <div className="ph">
          <span className="lbl">NEWS</span>
          <button className="ph-btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>[ × ]</button>
        </div>
        <div className="scroll">{items.length ? list : empty}</div>
      </Modal>
    </>
  )
}
