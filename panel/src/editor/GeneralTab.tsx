import { apiUrl } from '../api'
import { useEditor } from './ctx'

export function GeneralTab() {
  const { d } = useEditor()
  const cfg = d.draft!
  const home = cfg.home ?? cfg.pages[0]?.id
  return (
    <div>
      <div className="ed-h"><h1>General</h1></div>
      <div className="card form">
        <label className="fld">
          <span>Home page</span>
          <select className="in" value={home} onChange={(e) => d.edit((c) => { c.home = e.target.value })}>
            {cfg.pages.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
          </select>
          <small className="dim">Where the panel goes back to when nobody has touched it for a while.</small>
        </label>
        <label className="fld">
          <span>Back home after (minutes)</span>
          <input className="in" type="number" min={0} max={240} value={cfg.idleMinutes ?? 5}
            onChange={(e) => { const n = Math.max(0, Math.min(240, Math.round(Number(e.target.value)))); if (Number.isFinite(n)) d.edit((c) => { c.idleMinutes = n }) }} />
          <small className="dim">0 keeps whatever page is showing.</small>
        </label>
      </div>
      <div className="card">
        <b>Open on the deck</b>
        <p className="dim">Bookmark this on the phone and open it in landscape, full screen. The token stays in the URL, like the HUD.</p>
        <pre className="url">{apiUrl('/panel').replace(/token=[^&]+/, 'token=<WEBHOOK_TOKEN>')}</pre>
      </div>
    </div>
  )
}
