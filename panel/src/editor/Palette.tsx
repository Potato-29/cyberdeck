import { useMemo, useState } from 'react'
import { useEditor } from './ctx'

/** "Add a widget": the catalogue grouped by category, searchable. */
export function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  const { catalog } = useEditor()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hit = catalog.widgets.filter((w) => !needle || (w.name + ' ' + w.desc + ' ' + w.category).toLowerCase().includes(needle))
    const out = new Map<string, typeof hit>()
    for (const w of hit) out.set(w.category, [...(out.get(w.category) ?? []), w])
    return [...out]
  }, [catalog, q])
  return (
    <div className="card pal">
      <div className="pal-h">
        <b>Add a widget</b>
        <input className="in" placeholder={`Search ${catalog.widgets.length} widgets…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pal-list">
        {groups.map(([cat, list]) => (
          <div key={cat}>
            <div className="pal-cat">{cat}</div>
            {list.map((w) => (
              <button key={w.type} className="pal-item" onClick={() => onAdd(w.type)} title={`Add ${w.name} (${w.w}×${w.h})`}>
                <span className="pal-ic">{w.icon}</span>
                <span><b>{w.name}</b><span className="dim">{w.desc}</span></span>
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <div className="dim">Nothing matches “{q}”.</div>}
      </div>
    </div>
  )
}
