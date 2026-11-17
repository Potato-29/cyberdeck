import { METRICS } from '../metrics'
import { COLS, ROWS, opt, type OptionSpec, type Page, type WidgetInst } from '../types'
import { useToast } from '../ui/Toast'
import { useEditor } from './ctx'
import { fits } from './grid'

export function Inspector({ page, w, onChange, onRemove, onDuplicate }: {
  page: Page
  w: WidgetInst | null
  onChange: (fn: (w: WidgetInst, p: Page) => void) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const { specs } = useEditor()
  const toast = useToast()
  if (!w) {
    return <div className="card insp empty-insp dim">Click a widget on the canvas to edit it, or add one from the list.</div>
  }
  const spec = specs[w.type]

  const setPos = (k: 'x' | 'y' | 'w' | 'h', raw: string) => {
    const v = Math.round(Number(raw))
    if (!Number.isFinite(v)) return
    const next = { x: w.x, y: w.y, w: w.w, h: w.h, [k]: v }
    if (!fits(page, w, spec, next)) {
      toast('Doesn’t fit there', { text: 'It would leave the grid, go below its minimum size, or overlap another widget.', level: 'warn' })
      return
    }
    onChange((x) => { x[k] = v })
  }
  const setOpt = (key: string, v: unknown) => onChange((x) => { x.options = { ...(x.options ?? {}), [key]: v } })

  return (
    <div className="card insp">
      <div className="insp-h">
        <span className="insp-ic">{spec?.icon}</span>
        <b>{spec?.name ?? w.type}</b>
        <span className="grow" />
        <button className="btn" onClick={onDuplicate}>Duplicate</button>
        <button className="btn danger" onClick={onRemove}>Remove</button>
      </div>
      {spec && <p className="dim insp-d">{spec.desc}</p>}
      <div className="pos">
        {([['x', 'Column', COLS - 1], ['y', 'Row', ROWS - 1], ['w', 'Width', COLS], ['h', 'Height', ROWS]] as const).map(([k, label, max]) => (
          <label key={k} className="fld">
            <span>{label}</span>
            <input className="in" type="number" min={k === 'w' ? spec?.minW ?? 1 : k === 'h' ? spec?.minH ?? 1 : 0} max={max} value={w[k]} onChange={(e) => setPos(k, e.target.value)} />
          </label>
        ))}
      </div>
      {spec?.options.map((o) => <OptionField key={o.key} o={o} value={opt(w, spec, o.key)} onSet={(v) => setOpt(o.key, v)} />)}
    </div>
  )
}

function OptionField({ o, value, onSet }: { o: OptionSpec; value: unknown; onSet: (v: unknown) => void }) {
  const { d, refs } = useEditor()
  const shortcuts = d.draft!.shortcuts
  switch (o.type) {
    case 'bool':
      return (
        <label className="toggle fld-row">
          <input type="checkbox" checked={!!value} onChange={(e) => onSet(e.target.checked)} /><span />{o.label}
        </label>
      )
    case 'number':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <input className="in" type="number" min={o.min} max={o.max} value={Number(value ?? 0)}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onSet(Math.max(o.min ?? -Infinity, Math.min(o.max ?? Infinity, n))) }} />
        </label>
      )
    case 'select':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <select className="in" value={String(value ?? '')} onChange={(e) => onSet(e.target.value)}>
            {o.choices?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )
    case 'metric':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <select className="in" value={String(value ?? '')} onChange={(e) => onSet(e.target.value)}>
            {o.empty && <option value="">— none —</option>}
            <optgroup label="PC">{METRICS.filter((m) => m.key.startsWith('pc.')).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
            <optgroup label="Deck">{METRICS.filter((m) => m.key.startsWith('deck.')).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
          </select>
        </label>
      )
    case 'shortcut':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <select className="in" value={String(value ?? '')} onChange={(e) => onSet(e.target.value)}>
            <option value="">— pick one —</option>
            {shortcuts.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
          </select>
        </label>
      )
    case 'shortcuts': {
      const picked = new Set((value as string[] | undefined) ?? [])
      return (
        <div className="fld">
          <span>{o.label}</span>
          <div className="checks">
            {shortcuts.map((k) => (
              <label key={k.id} className="check">
                <input
                  type="checkbox"
                  checked={picked.has(k.id)}
                  onChange={(e) => {
                    // Keep the order of the Shortcuts tab, so reordering there reorders here.
                    const next = new Set(picked)
                    if (e.target.checked) next.add(k.id); else next.delete(k.id)
                    onSet(shortcuts.map((s) => s.id).filter((id) => next.has(id)))
                  }}
                />
                {k.icon} {k.label}
              </label>
            ))}
            {!shortcuts.length && <span className="dim">No shortcuts yet — add some in the Shortcuts tab.</span>}
          </div>
        </div>
      )
    }
    case 'pushkey':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <input className="in" list="push-keys" value={String(value ?? '')} pattern="[A-Za-z0-9_.\-]{1,64}" onChange={(e) => onSet(e.target.value.trim())} />
          <datalist id="push-keys">{Object.keys(refs.pushes).map((k) => <option key={k} value={k} />)}</datalist>
        </label>
      )
    case 'lines':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <textarea className="in" rows={4} value={((value as string[] | undefined) ?? []).join('\n')} onChange={(e) => onSet(e.target.value.split('\n'))} />
        </label>
      )
    case 'color':
      return (
        <label className="fld">
          <span>{o.label}</span>
          <input className="in" type="color" value={String(value ?? '#8e8e93')} onChange={(e) => onSet(e.target.value)} />
        </label>
      )
    default:
      return (
        <label className="fld">
          <span>{o.label}</span>
          <input className="in" value={String(value ?? '')} onChange={(e) => onSet(e.target.value)} />
        </label>
      )
  }
}

