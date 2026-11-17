import { useState } from 'react'
import { call } from '../api'
import { useToast } from '../ui/Toast'
import { useEditor } from './ctx'

/** curl examples with this hub's address filled in. The token is never shown: $TOKEN stands in for it. */
function examples(base: string, page: string): [string, string][] {
  const u = (p: string) => `"${base}${p}?token=$TOKEN"`
  return [
    ['A value for a Pushed value widget with key “temperature”', `curl -X POST ${u('/panel/push/temperature')} -d 21.5`],
    ['A value with a title, colour and progress ring', `curl -X POST ${u('/panel/push/build')} \\\n  -H "Content-Type: application/json" \\\n  -d '{"value":"passed","sub":"main · 3m 12s","level":"ok","progress":100}'`],
    ['A value that disappears after 10 minutes', `curl -X POST "${base}/panel/push/door?token=$TOKEN&ttl=600" -d open`],
    ['A list (Pushed value widget, List style)', `curl -X POST ${u('/panel/push/deploys')} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Deploys","items":[{"label":"api","value":"ok","level":"ok"},{"label":"web","value":"failed","level":"error"}]}'`],
    ['A notification (toast + the Notifications widget), optionally switching page', `curl -X POST ${u('/panel/notify')} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Deploy","text":"Production is live","level":"ok","page":"${page}"}'`],
    ['Switch the panel to a page (by id or number)', `curl -X POST ${u(`/panel/goto/${page}`)}`],
    ['…without the 3-second countdown', `curl -X POST "${base}/panel/goto/${page}?token=$TOKEN&countdown=0"`],
    ['Remove a value', `curl -X DELETE ${u('/panel/push/door')}`],
  ]
}

const age = (ts: number) => {
  const s = Math.round(Date.now() / 1000 - ts)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`
}

export function WebhooksTab() {
  const { d, refs } = useEditor()
  const toast = useToast()
  const pages = d.draft!.pages
  const [gotoPage, setGotoPage] = useState(pages[0]?.id ?? '')
  const pushes = Object.entries(refs.pushes).sort((a, b) => b[1].ts - a[1].ts)

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); toast(label, { level: 'ok' }); refs.refreshPushes() } catch (e) { toast(label, { text: (e as Error).message, level: 'error' }) }
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast('Copied', { level: 'ok', seconds: 1.5 }), () => toast('Copy failed — select the text instead', { level: 'warn' }))
  }

  return (
    <div>
      <div className="ed-h">
        <h1>Webhooks</h1>
        <p className="dim">
          Anything that can make an HTTP request can put things on the panel: cron scripts on the deck, the ESP32s, CI, Home Assistant.
          Every call needs the hub token (<code>?token=</code> or an <code>X-Token</code> header), the same <code>WEBHOOK_TOKEN</code> as the rest of the hub.
          Values survive restarts; notifications and page switches reach the panel within about 2 seconds.
        </p>
      </div>

      <div className="card">
        <b>Try it</b>
        <div className="sc-row wrap" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => run('Notification sent', () => call('/panel/notify', {}, 'POST', { title: 'Test', text: 'Sent from the control panel', level: 'ok' }))}>Send a test notification</button>
          <button className="btn" onClick={() => run('Pushed “test”', () => call('/panel/push/test', {}, 'POST', { value: Math.round(Math.random() * 100), unit: '%', title: 'Test value', progress: Math.random() }))}>Push a test value</button>
          <span className="grow" />
          <select className="in" value={gotoPage} onChange={(e) => setGotoPage(e.target.value)}>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
          </select>
          <button className="btn" onClick={() => run('Page switch sent', () => call('/panel/goto/' + encodeURIComponent(gotoPage)))}>Switch the panel</button>
        </div>
      </div>

      <div className="card">
        <b>Pushed values</b>
        {pushes.length ? (
          <table className="tbl">
            <thead><tr><th>Key</th><th>Value</th><th>Updated</th><th>Expires</th><th /></tr></thead>
            <tbody>
              {pushes.map(([k, v]) => (
                <tr key={k}>
                  <td><code>{k}</code></td>
                  <td className="clip">{v.icon} {v.items ? `${v.items.length} items` : String(v.value ?? '')}{v.unit ?? ''}{v.title ? <span className="dim"> · {v.title}</span> : null}</td>
                  <td className="dim">{age(v.ts)}</td>
                  <td className="dim">{v.expires ? new Date(v.expires * 1000).toLocaleTimeString() : 'never'}</td>
                  <td><button className="chip" onClick={() => run(`Removed ${k}`, () => call('/panel/push/' + encodeURIComponent(k), {}, 'DELETE'))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="dim">None yet.</p>}
      </div>

      <div className="card">
        <b>Examples</b>
        <p className="dim">Set <code>TOKEN</code> in your shell first. It's your <code>WEBHOOK_TOKEN</code>, which this page never shows.</p>
        {examples(location.origin, pages[0]?.id ?? 'home').map(([what, cmd]) => (
          <div key={what} className="ex">
            <div className="ex-h"><span>{what}</span><button className="chip" onClick={() => copy(cmd)}>Copy</button></div>
            <pre>{cmd}</pre>
          </div>
        ))}
        <table className="tbl small">
          <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><code>value, title, sub, unit, icon, color</code></td><td>What the widget shows. Plain text or a number works too.</td></tr>
            <tr><td><code>level</code></td><td><code>ok</code> / <code>warn</code> / <code>error</code> / <code>info</code> colours it. Values like passed, failed, running are coloured automatically.</td></tr>
            <tr><td><code>progress</code></td><td>0–1 or 0–100: a bar under the value, or the ring in Ring style.</td></tr>
            <tr><td><code>items</code></td><td>A list (strings or <code>{'{label, value, level}'}</code>) for the List style.</td></tr>
            <tr><td><code>ttl</code></td><td>Seconds until the value disappears (also <code>?ttl=</code>).</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
