import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import { useData } from '../data'
import { Num } from '../fx/AnimatedNumber'
import { useForza } from '../hooks/useForza'
import { IcCloud, IcFlag, IcNews } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { Tile } from '../ui/Tile'

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
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <Tile id="weather" area="1 / 1 / 2 / 3" icon={<IcCloud />} title="Ahmedabad" accent="var(--blue)"
      aside={now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1, minHeight: 0 }}>
        <Num value={w.temp} unit="°" className="big" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{w.description ?? '–'}</div>
          <div className="small dim" style={{ marginTop: 3 }}>
            Feels <Num value={w.feels_like} unit="°" /> · Humidity <Num value={w.humidity} unit="%" />
          </div>
        </div>
      </div>
    </Tile>
  )
}

function Forza() {
  const t = useForza()
  // Rev bar redline ~8k; the real ceiling varies per car, this is just a feel meter.
  const rev = t ? Math.min(1, t.rpm / 8000) : 0
  return (
    <Tile id="forza" area="2 / 1 / 3 / 3" icon={<IcFlag />} title="Forza"
      accent={t ? 'var(--orange)' : undefined}
      aside={<a href="https://race.prayas.space" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Open HUD ›</a>}>
      <AnimatePresence mode="wait" initial={false}>
        {t ? (
          <m.div key="live" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flex: 1 }}>
              <m.div key={t.gear} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="big" style={{ fontSize: 54, color: 'var(--orange)' }}>{t.gear}</m.div>
              <div><Num value={t.speed} unit="km/h" className="big" /></div>
              <div style={{ marginLeft: 'auto' }} className="dim"><Num value={t.rpm} unit="rpm" className="mid" /></div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--tile-2)', overflow: 'hidden', marginTop: 8 }}>
              <m.div style={{ height: '100%', background: 'linear-gradient(90deg, var(--green), var(--yellow), var(--red))', transformOrigin: 'left' }}
                animate={{ scaleX: rev }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
            </div>
          </m.div>
        ) : (
          <m.div key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="mid faint">No telemetry</div>
              <div className="tiny faint" style={{ marginTop: 4 }}>
                {location.protocol === 'https:' ? 'Live link works on the LAN only' : 'Waiting for the game…'}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </Tile>
  )
}

function News() {
  const items = useData().dash.data?.rss ?? []
  const [open, setOpen] = useState(false)
  const list = (limit: number) => (
    <m.ul style={{ listStyle: 'none', margin: 0, padding: 0 }}
      initial="hidden" animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
      {items.slice(0, limit).map((it) => (
        <m.li key={it.link + it.title}
          variants={{ hidden: { opacity: 0, x: 12 }, show: { opacity: 1, x: 0 } }}
          style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
          <a href={it.link} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
            <div className="tiny faint" style={{ fontWeight: 600 }}>{it.published}</div>
            <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{it.title}</div>
          </a>
        </m.li>
      ))}
      {!items.length && <li className="small faint">No feed data</li>}
    </m.ul>
  )
  return (
    <>
      <Tile id="news" area="1 / 3 / 3 / 5" icon={<IcNews />} title="Tech news" accent="var(--pink)" onExpand={() => setOpen(true)}>
        <div className="scroll-y" style={{ flex: 1 }}>{list(10)}</div>
      </Tile>
      <Sheet id="news" open={open} onClose={() => setOpen(false)}>
        <header className="tile-head" style={{ color: 'var(--pink)', fontSize: 14 }}>
          <IcNews /><span>Tech news</span>
          <button className="aside" onClick={() => setOpen(false)} style={{ color: 'var(--blue)', fontWeight: 600 }}>Done</button>
        </header>
        <div className="scroll-y" style={{ minHeight: 0 }}>{list(10)}</div>
      </Sheet>
    </>
  )
}
