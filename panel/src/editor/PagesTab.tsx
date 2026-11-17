import { useEffect, useMemo, useState, type DragEvent } from 'react'
import type { Page, Template } from '../types'
import { useConfirm } from '../ui/Confirm'
import { useToast } from '../ui/Toast'
import { Canvas } from './Canvas'
import { useEditor } from './ctx'
import { newId, placeNew, slugId } from './grid'
import { Inspector } from './Inspector'
import { Palette } from './Palette'
import { Preview } from './Preview'

const fromTemplate = (t: Template) => t.widgets.map((w) => ({ ...w, id: newId(), options: { ...(w.options ?? {}) } }))

export function PagesTab() {
  const { d, specs } = useEditor()
  const toast = useToast()
  const confirm = useConfirm()
  const cfg = d.draft!
  const [pageId, setPageId] = useState(() => cfg.pages[0]?.id ?? '')
  const [sel, setSel] = useState<string | null>(null)
  const [picker, setPicker] = useState<null | 'new' | 'replace'>(null)
  const [preview, setPreview] = useState(false)

  const pi = Math.max(0, cfg.pages.findIndex((p) => p.id === pageId))
  const page = cfg.pages[pi]
  useEffect(() => { if (page && page.id !== pageId) setPageId(page.id) }, [page, pageId])
  const selected = page?.widgets.find((w) => w.id === sel) ?? null

  const editPage = (fn: (p: Page) => void) => d.edit((c) => fn(c.pages[pi]))

  const addPage = (t: Template | null) => {
    const taken = new Set(cfg.pages.map((p) => p.id))
    const id = slugId(t?.title ?? 'page', taken, 'page')
    d.edit((c) => {
      c.pages.push({ id, title: t?.title ?? 'New page', icon: t?.icon ?? '📄', shown: true, widgets: t ? fromTemplate(t) : [] })
    })
    setPageId(id)
    setSel(null)
  }

  const removePage = async () => {
    if (cfg.pages.length < 2) { toast('Keep at least one page', { level: 'warn' }); return }
    if (!(await confirm({ title: `Delete “${page.title}”?`, body: `${page.widgets.length} widgets go with it. Undo brings it back until you leave.`, action: 'Delete', danger: true }))) return
    const refs = cfg.shortcuts.filter((k) => k.do.kind === 'goto' && k.do.ref === page.id)
    d.edit((c) => {
      c.pages.splice(pi, 1)
      if (c.home === page.id) c.home = c.pages[0].id
    })
    if (refs.length) toast('Shortcuts point at the deleted page', { text: refs.map((k) => k.label).join(', ') + ' — fix them before saving.', level: 'warn', seconds: 7 })
    setSel(null)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= cfg.pages.length || from === to) return
    d.edit((c) => { const [p] = c.pages.splice(from, 1); c.pages.splice(to, 0, p) })
  }

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const onDrop = (e: DragEvent, i: number) => { e.preventDefault(); if (dragFrom != null) move(dragFrom, i); setDragFrom(null) }

  const addWidget = (type: string) => {
    const spec = specs[type]
    const w = spec && placeNew(page, spec)
    if (!w) { toast('No room on this page', { text: 'Make space or shrink a widget first.', level: 'warn' }); return }
    editPage((p) => p.widgets.push(w))
    setSel(w.id)
  }

  const homeId = cfg.home ?? cfg.pages[0]?.id

  return (
    <div className="pages">
      <div className="ed-h">
        <h1>Pages</h1>
        <p className="dim">
          Each page is a 12 × 6 grid of widgets. Pick a page on the left, arrange its widgets on the canvas and set their options.
          Drag pages to reorder them. On the phone, swipe, tap the dots, or tap the current dot for an overview of every page.
        </p>
      </div>
      <div className="pages-cols">
        <aside className="page-list">
          {cfg.pages.map((p, i) => (
            <button
              key={p.id}
              className={'page-item' + (i === pi ? ' on' : '') + (p.shown === false ? ' hidden' : '')}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, i)}
              onClick={() => { setPageId(p.id); setSel(null) }}
            >
              <span className="dim pi-n">{i + 1}</span>
              <span className="pi-ic">{p.icon}</span>
              <span className="pi-t">{p.title}{p.id === homeId && <small className="dim"> · home</small>}</span>
              <span className="pi-c">{p.widgets.length}</span>
            </button>
          ))}
          <button className="btn wide" onClick={() => setPicker('new')}>+ New page</button>
        </aside>

        {page && (
          <section className="page-edit">
            <div className="card page-head">
              <div className="ph-row">
                <input className="in ic" value={page.icon ?? ''} maxLength={4} aria-label="Page icon" onChange={(e) => editPage((p) => { p.icon = e.target.value })} />
                <input className="in grow" value={page.title} maxLength={40} aria-label="Page title" onChange={(e) => editPage((p) => { p.title = e.target.value })} />
                <label className="toggle">
                  <input type="checkbox" checked={page.shown !== false} onChange={(e) => editPage((p) => { p.shown = e.target.checked })} />
                  <span />Shown
                </label>
                <button className="btn sq" title="Move up" disabled={pi === 0} onClick={() => move(pi, pi - 1)}>↑</button>
                <button className="btn sq" title="Move down" disabled={pi === cfg.pages.length - 1} onClick={() => move(pi, pi + 1)}>↓</button>
              </div>
              <div className="ph-row">
                <button className="btn" onClick={() => setPicker('replace')}>Replace with template…</button>
                <button className="btn" onClick={() => {
                  const id = slugId(page.title + ' copy', new Set(cfg.pages.map((p) => p.id)), 'page')
                  d.edit((c) => c.pages.splice(pi + 1, 0, { ...structuredClone(page), id, title: page.title + ' copy', widgets: page.widgets.map((w) => ({ ...structuredClone(w), id: newId() })) }))
                  setPageId(id)
                }}>Duplicate page</button>
                <button className="btn" disabled={!page.widgets.length} onClick={() => { editPage((p) => { p.widgets = [] }); setSel(null) }}>Clear</button>
                <span className="dim ph-id">id: {page.id}</span>
                <button className="btn danger" onClick={removePage}>Delete page</button>
              </div>
            </div>

            <div className="canvas-bar">
              <span className="dim">{preview ? 'Live preview: your unsaved layout with live data.' : 'Drag a widget to move it, drag its corner to resize. Widgets cannot overlap. Click one to edit its options.'}</span>
              <label className="toggle">
                <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                <span />Live preview
              </label>
            </div>
            {preview ? <Preview page={page} /> : <Canvas page={page} sel={sel} onSelect={setSel} onChange={(fn) => editPage(fn)} />}

            <div className="page-bottom">
              <Inspector
                page={page}
                w={selected}
                onChange={(fn) => editPage((p) => { const w = p.widgets.find((x) => x.id === sel); if (w) fn(w, p) })}
                onRemove={() => { editPage((p) => { p.widgets = p.widgets.filter((x) => x.id !== sel) }); setSel(null) }}
                onDuplicate={() => {
                  if (!selected) return
                  const spec = specs[selected.type]
                  const w = spec && placeNew({ ...page }, { ...spec, w: selected.w, h: selected.h })
                  if (!w) { toast('No room for a copy', { level: 'warn' }); return }
                  w.options = structuredClone(selected.options ?? {})
                  editPage((p) => p.widgets.push(w))
                  setSel(w.id)
                }}
              />
              <Palette onAdd={addWidget} />
            </div>
          </section>
        )}
      </div>

      {picker && (
        <TemplatePicker
          title={picker === 'new' ? 'New page' : `Replace “${page.title}” with…`}
          allowBlank={picker === 'new'}
          onClose={() => setPicker(null)}
          onPick={(t) => {
            setPicker(null)
            if (picker === 'new') addPage(t)
            else if (t) { editPage((p) => { p.widgets = fromTemplate(t) }); setSel(null) }
          }}
        />
      )}
    </div>
  )
}

function TemplatePicker({ title, allowBlank, onPick, onClose }: { title: string; allowBlank: boolean; onPick: (t: Template | null) => void; onClose: () => void }) {
  const { catalog, specs } = useEditor()
  const list = useMemo(() => catalog.templates, [catalog])
  return (
    <div className="scrim fade" onClick={onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-t">{title}</div>
        <div className="tpl-grid">
          {allowBlank && (
            <button className="tpl" onClick={() => onPick(null)}>
              <div className="tpl-mini" />
              <b>📄 Blank</b><span className="dim">Start from an empty grid.</span>
            </button>
          )}
          {list.map((t) => (
            <button key={t.id} className="tpl" onClick={() => onPick(t)}>
              <div className="tpl-mini">
                {t.widgets.map((w, i) => (
                  <i key={i} style={{ gridArea: `${w.y + 1} / ${w.x + 1} / span ${w.h} / span ${w.w}` }} title={specs[w.type]?.name}>{specs[w.type]?.icon}</i>
                ))}
              </div>
              <b>{t.icon} {t.title}</b><span className="dim">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="dialog-row"><button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}
