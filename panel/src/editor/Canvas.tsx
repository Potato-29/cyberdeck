import { useRef, useState, type PointerEvent } from 'react'
import { METRIC } from '../metrics'
import { COLS, ROWS, opt, type Config, type Page, type WidgetInst, type WidgetSpec } from '../types'
import { useEditor } from './ctx'
import { fits } from './grid'

type Rect = { x: number; y: number; w: number; h: number }
interface Drag { id: string; mode: 'move' | 'resize'; px: number; py: number; orig: Rect; cur: Rect; blocked: boolean }

/** One line under a widget's name on the canvas, e.g. "CPU load" or "all keys · 3 columns". */
export function summary(w: WidgetInst, spec: WidgetSpec | undefined, cfg: Config): string {
  if (!spec) return 'unknown type'
  const metric = (k: string) => METRIC[opt<string>(w, spec, k)]?.label
  switch (w.type) {
    case 'gauge': case 'stat': return metric('metric') ?? 'no reading'
    case 'chart': return ['metric', 'metric2', 'metric3'].map((k) => METRIC[opt<string>(w, spec, k)]?.short).filter(Boolean).join(' · ')
    case 'keys': {
      const ks = opt<string[]>(w, spec, 'keys') ?? []
      return `${ks.length ? ks.length + ' keys' : 'all keys'} · ${opt<number>(w, spec, 'columns')} columns`
    }
    case 'button': return cfg.shortcuts.find((k) => k.id === opt<string>(w, spec, 'key'))?.label ?? 'no shortcut'
    case 'pushed': return 'key: ' + opt<string>(w, spec, 'key')
    case 'title': return opt<string>(w, spec, 'text')
    default: return ''
  }
}

export function Canvas({ page, sel, onSelect, onChange }: {
  page: Page
  sel: string | null
  onSelect: (id: string | null) => void
  onChange: (fn: (p: Page) => void) => void
}) {
  const { specs, d } = useEditor()
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const down = (e: PointerEvent, w: WidgetInst) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onSelect(w.id)
    const mode = (e.target as HTMLElement).classList.contains('rz') ? 'resize' : 'move'
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const r = { x: w.x, y: w.y, w: w.w, h: w.h }
    setDrag({ id: w.id, mode, px: e.clientX, py: e.clientY, orig: r, cur: r, blocked: false })
  }

  const move = (e: PointerEvent, w: WidgetInst) => {
    if (!drag || drag.id !== w.id || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    const dx = Math.round(((e.clientX - drag.px) / box.width) * COLS)
    const dy = Math.round(((e.clientY - drag.py) / box.height) * ROWS)
    const o = drag.orig
    const spec = specs[w.type]
    const next: Rect = drag.mode === 'move'
      ? { ...o, x: Math.max(0, Math.min(COLS - o.w, o.x + dx)), y: Math.max(0, Math.min(ROWS - o.h, o.y + dy)) }
      : { ...o, w: Math.max(spec?.minW ?? 1, Math.min(COLS - o.x, o.w + dx)), h: Math.max(spec?.minH ?? 1, Math.min(ROWS - o.y, o.h + dy)) }
    if (next.x === drag.cur.x && next.y === drag.cur.y && next.w === drag.cur.w && next.h === drag.cur.h) return
    // Like PhoneBox: the box only goes where it fits; a blocked spot keeps the
    // last good position and outlines it red until the pointer moves on.
    if (fits(page, w, spec, next)) setDrag({ ...drag, cur: next, blocked: false })
    else setDrag({ ...drag, blocked: true })
  }

  const up = () => {
    if (!drag) return
    const { id, cur, orig } = drag
    setDrag(null)
    if (cur.x !== orig.x || cur.y !== orig.y || cur.w !== orig.w || cur.h !== orig.h) {
      onChange((p) => { const w = p.widgets.find((x) => x.id === id); if (w) Object.assign(w, cur) })
    }
  }

  return (
    <div className="canvas-frame">
      <div className="canvas" ref={ref} onPointerDown={() => onSelect(null)}>
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <div key={i} className="cv-cell" style={{ gridArea: `${Math.floor(i / COLS) + 1} / ${(i % COLS) + 1}` }} />
        ))}
        {page.widgets.map((w) => {
          const r = drag?.id === w.id ? drag.cur : w
          const spec = specs[w.type]
          return (
            <div
              key={w.id}
              className={'wb' + (w.id === sel ? ' sel' : '') + (drag?.id === w.id ? ' dragging' : '') + (drag?.id === w.id && drag.blocked ? ' blocked' : '')}
              style={{ gridArea: `${r.y + 1} / ${r.x + 1} / span ${r.h} / span ${r.w}` }}
              onPointerDown={(e) => down(e, w)}
              onPointerMove={(e) => move(e, w)}
              onPointerUp={up}
              onPointerCancel={up}
              title={spec?.name ?? w.type}
            >
              <div className="wb-in">
                <span className="wb-ic">{spec?.icon ?? '❓'}</span>
                <b>{spec?.name ?? w.type}</b>
                <small>{summary(w, spec, d.draft!)}</small>
              </div>
              <span className="rz" title="Drag to resize" />
            </div>
          )
        })}
        {!page.widgets.length && <div className="cv-empty dim">Empty page — add a widget from the list below, or replace it with a template.</div>}
      </div>
    </div>
  )
}
