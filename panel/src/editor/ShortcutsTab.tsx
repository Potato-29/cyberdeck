import { useState, type CSSProperties, type DragEvent } from 'react'
import { call } from '../api'
import type { Shortcut, ShortcutKind } from '../types'
import { useConfirm } from '../ui/Confirm'
import { useToast } from '../ui/Toast'
import { useEditor } from './ctx'
import { slugId } from './grid'

const KINDS: [ShortcutKind, string, string][] = [
  ['pc_app', 'Launch a PC app', 'from deck-apps.json, via the PC agent'],
  ['action', 'Run a deck action', 'from actions.json'],
  ['spotify', 'Spotify', 'play, pause, skip'],
  ['service_restart', 'Start / restart a service', 'from services.json'],
  ['service_stop', 'Stop a service', 'from services.json'],
  ['feed', 'Feed the cat', 'the ESP32 feeder'],
  ['goto', 'Go to a page', 'on the panel'],
  ['push', 'Push a value', 'for a Pushed value widget'],
  ['url', 'Open a URL', 'on the device that pressed it'],
]
const SPOTIFY: [string, string][] = [['toggle', 'Play / pause'], ['play', 'Play'], ['pause', 'Pause'], ['next', 'Next track'], ['previous', 'Previous track']]
const SWATCHES = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#5e5ce6', '#8e8e93']

export function ShortcutsTab() {
  const { d } = useEditor()
  const confirm = useConfirm()
  const keys = d.draft!.shortcuts
  const [sel, setSel] = useState<string | null>(keys[0]?.id ?? null)
  const k = keys.find((x) => x.id === sel) ?? null
  const ki = keys.findIndex((x) => x.id === sel)

  const editKey = (fn: (k: Shortcut) => void) => d.edit((c) => { const x = c.shortcuts.find((s) => s.id === sel); if (x) fn(x) })

  const add = () => {
    const id = slugId('new key', new Set(keys.map((x) => x.id)), 'key')
    d.edit((c) => c.shortcuts.push({ id, label: 'New key', icon: '⭐', color: '#0a84ff', do: { kind: 'pc_app', ref: '' } }))
    setSel(id)
  }

  const remove = async () => {
    if (!k) return
    const used = d.draft!.pages.flatMap((p) => p.widgets.filter((w) =>
      (w.type === 'button' && w.options?.key === k.id) || (w.type === 'keys' && (w.options?.keys as string[] | undefined)?.includes(k.id)),
    ).map(() => p.title))
    if (!(await confirm({
      title: `Delete “${k.label}”?`,
      body: used.length ? `It's used on: ${[...new Set(used)].join(', ')}. Those keys disappear from the panel.` : undefined,
      action: 'Delete',
      danger: true,
    }))) return
    d.edit((c) => {
      c.shortcuts = c.shortcuts.filter((s) => s.id !== k.id)
      for (const p of c.pages) for (const w of p.widgets) {
        if (w.type === 'keys' && Array.isArray(w.options?.keys)) w.options!.keys = (w.options!.keys as string[]).filter((id) => id !== k.id)
        if (w.type === 'button' && w.options?.key === k.id) w.options!.key = ''
      }
    })
    setSel(keys[ki + 1]?.id ?? keys[ki - 1]?.id ?? null)
  }

  // A key that has never been saved takes its id from its label, so ids read
  // like "on-air" rather than "new-key". Saved ids never change: widgets and
  // scripts may point at them.
  const rename = (label: string) => {
    if (!k) return
    const fresh = !d.saved?.shortcuts.some((s) => s.id === k.id)
    const id = fresh ? slugId(label, new Set(keys.filter((x) => x.id !== k.id).map((x) => x.id)), 'key') : k.id
    d.edit((c) => {
      const x = c.shortcuts.find((s) => s.id === k.id)
      if (!x) return
      x.label = label
      if (id === k.id) return
      x.id = id
      for (const p of c.pages) for (const w of p.widgets) {
        if (w.type === 'button' && w.options?.key === k.id) w.options!.key = id
        if (w.type === 'keys' && Array.isArray(w.options?.keys)) w.options!.keys = (w.options!.keys as string[]).map((v) => (v === k.id ? id : v))
      }
    })
    setSel(id)
  }

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const drop = (e: DragEvent, to: number) => {
    e.preventDefault()
    if (dragFrom == null || dragFrom === to) return
    d.edit((c) => { const [x] = c.shortcuts.splice(dragFrom, 1); c.shortcuts.splice(to, 0, x) })
    setDragFrom(null)
  }

  return (
    <div>
      <div className="ed-h">
        <h1>Shortcuts</h1>
        <p className="dim">
          Stream Deck-style keys for the Shortcut grid and Big button widgets. A key picks <em>what</em> to run from lists the hub
          already allows: deck actions, PC apps, services, Spotify. It never holds a shell command. New commands go in
          <code> actions.json</code> on the deck by hand. Drag to reorder.
        </p>
      </div>
      <div className="sc-cols">
        <div className="sc-list">
          {keys.map((x, i) => (
            <button
              key={x.id}
              className={'sc-item' + (x.id === sel ? ' on' : '')}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => drop(e, i)}
              onClick={() => setSel(x.id)}
              style={{ '--k': x.color ?? '#8e8e93' } as CSSProperties}
            >
              <span className="sc-sw">{x.icon}</span>
              <span className="clip">{x.label}</span>
              <span className="dim sc-kind">{KINDS.find(([kk]) => kk === x.do.kind)?.[1]}</span>
            </button>
          ))}
          <button className="btn wide" onClick={add}>+ New shortcut</button>
        </div>
        {k ? <KeyForm k={k} edit={editKey} onRemove={remove} onRename={rename} /> : <div className="card dim">No shortcut selected.</div>}
      </div>
    </div>
  )
}

function KeyForm({ k, edit, onRemove, onRename }: { k: Shortcut; edit: (fn: (k: Shortcut) => void) => void; onRemove: () => void; onRename: (label: string) => void }) {
  const { d, refs } = useEditor()
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const pages = d.draft!.pages
  const savedKey = d.saved?.shortcuts.find((s) => s.id === k.id)
  const unsaved = !savedKey || JSON.stringify(savedKey) !== JSON.stringify(k)

  const test = async () => {
    if (k.do.kind === 'url') { window.open(k.do.ref, '_blank', 'noopener'); return }
    if (unsaved) { toast('Save first', { text: 'Test runs the saved version of this key on the hub.', level: 'warn' }); return }
    setTesting(true)
    try {
      const r = await call('/panel/key/' + encodeURIComponent(k.id))
      toast(`${k.label}: ok`, { text: String(r.status ?? ''), level: 'ok' })
      if (k.do.kind === 'push') refs.refreshPushes()
    } catch (e) {
      toast(k.label, { text: (e as Error).message, level: 'error', seconds: 6 })
    } finally {
      setTesting(false)
    }
  }

  const setKind = (kind: ShortcutKind) => edit((x) => {
    const ref = kind === 'spotify' ? 'toggle' : kind === 'goto' ? pages[0]?.id ?? '' : kind === 'url' ? 'https://' : ''
    x.do = { kind, ref }
  })
  const setRef = (ref: string) => edit((x) => { x.do = { ...x.do, ref } })

  const refField = () => {
    const sel = (opts: [string, string][], placeholder: string, freeText = false) => (
      <>
        <select className="in" value={k.do.ref} onChange={(e) => setRef(e.target.value)}>
          <option value="">{placeholder}</option>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {k.do.ref && !opts.some(([v]) => v === k.do.ref) && <option value={k.do.ref}>{k.do.ref} (not found)</option>}
        </select>
        {freeText && <input className="in" placeholder="…or type its key" value={k.do.ref} onChange={(e) => setRef(e.target.value.trim())} />}
      </>
    )
    switch (k.do.kind) {
      case 'pc_app':
        return sel(refs.apps.map((a) => [a.key, `${a.icon ?? ''} ${a.label ?? a.key}`.trim()]), refs.appsOnline ? '— pick an app —' : 'PC agent offline — type the key', !refs.appsOnline)
      case 'action': return sel(refs.actions.map((a) => [a.key, a.label + (a.confirm ? ' (asks first)' : '')]), '— pick an action —')
      case 'service_restart': case 'service_stop': return sel(refs.services.map((s) => [s, s]), '— pick a service —')
      case 'spotify': return sel(SPOTIFY, '— pick —')
      case 'goto': return sel(pages.map((p) => [p.id, `${p.icon ?? ''} ${p.title}`.trim()]), '— pick a page —')
      case 'url': return <input className="in" value={k.do.ref} placeholder="https://…" onChange={(e) => setRef(e.target.value.trim())} />
      case 'push':
        return (
          <div className="push-f">
            <input className="in" list="push-keys-sc" placeholder="key" value={k.do.ref} onChange={(e) => setRef(e.target.value.trim())} />
            <datalist id="push-keys-sc">{Object.keys(refs.pushes).map((p) => <option key={p} value={p} />)}</datalist>
            <input className="in" placeholder="value" value={k.do.value ?? ''} onChange={(e) => edit((x) => { x.do = { ...x.do, value: e.target.value } })} />
            <input className="in" type="number" min={0} placeholder="ttl s" value={k.do.ttl ?? ''} title="Seconds until the value disappears (empty = never)"
              onChange={(e) => edit((x) => { x.do = { ...x.do, ttl: e.target.value ? Number(e.target.value) : undefined } })} />
          </div>
        )
      default: return null
    }
  }

  return (
    <div className="card sc-form">
      <div className="sc-preview">
        <button className="key" style={{ '--k': k.color ?? '#8e8e93' } as CSSProperties} onClick={test} disabled={testing} title="Test">
          {k.icon && <span className="key-ic">{k.icon}</span>}
          <span className="key-l">{k.label}</span>
        </button>
      </div>
      <div className="sc-fields">
        <div className="sc-row">
          <label className="fld grow"><span>Label</span><input className="in" value={k.label} maxLength={24} onChange={(e) => onRename(e.target.value)} /></label>
          <label className="fld"><span>Icon</span><input className="in ic" value={k.icon ?? ''} maxLength={4} onChange={(e) => edit((x) => { x.icon = e.target.value })} /></label>
        </div>
        <div className="fld">
          <span>Colour</span>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button key={c} className={'sw' + (k.color === c ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => edit((x) => { x.color = c })} />
            ))}
            <input type="color" value={k.color ?? '#8e8e93'} onChange={(e) => edit((x) => { x.color = e.target.value })} aria-label="Custom colour" />
          </div>
        </div>
        <label className="fld">
          <span>Does</span>
          <select className="in" value={k.do.kind} onChange={(e) => setKind(e.target.value as ShortcutKind)}>
            {KINDS.map(([v, l, hint]) => <option key={v} value={v}>{l} — {hint}</option>)}
          </select>
        </label>
        {k.do.kind !== 'feed' && <div className="fld"><span>Which</span><div className="ref-f">{refField()}</div></div>}
        <label className="toggle fld-row">
          <input type="checkbox" checked={!!k.confirm} onChange={(e) => edit((x) => { x.confirm = e.target.checked || undefined })} /><span />Ask before running
        </label>
        <div className="sc-row end">
          <span className="dim">id: {k.id}</span>
          <span className="grow" />
          <button className="btn" onClick={test} disabled={testing}>{testing ? 'Running…' : 'Test'}</button>
          <button className="btn danger" onClick={onRemove}>Delete</button>
        </div>
      </div>
    </div>
  )
}
