import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelCtx } from '../ctx'
import { DataProvider } from '../data'
import { Grid } from '../panel/Grid'
import type { Page } from '../types'
import { useEditor } from './ctx'

const W = 780, H = 360 // the deck's screen in CSS px, landscape

/**
 * The real panel grid for the unsaved page, with live data, drawn at the
 * phone's size and scaled to fit. Shortcuts pressed here really run.
 */
export function Preview({ page }: { page: Page }) {
  const { d, specs } = useEditor()
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1.6, (el.clientWidth - 24) / W))) // minus the 12px frame padding each side
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const types = useMemo(() => new Set(page.widgets.map((w) => w.type)), [page])
  const api = useMemo(() => ({ config: d.draft!, specs, goto: () => {}, preview: true }), [d.draft, specs])
  return (
    <div className="canvas-frame" ref={box} style={{ height: H * scale + 24 }}>
      <div className="preview" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <PanelCtx.Provider value={api}>
          <DataProvider types={types} notes={[]}>
            <Grid page={page} />
          </DataProvider>
        </PanelCtx.Provider>
      </div>
    </div>
  )
}
