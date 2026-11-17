import { COLS, ROWS, type Page, type WidgetInst, type WidgetSpec } from '../types'

// Placement rules, ported from PhoneBox's settings.html (overlaps / freeSpot).

export function overlaps(page: Page, skipId: string | null, x: number, y: number, w: number, h: number): boolean {
  return page.widgets.some((o) => o.id !== skipId && x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)
}

/** First free spot for a w × h widget, shrinking it towards its minimum if the page is too full. */
export function freeSpot(page: Page, w: number, h: number, minW: number, minH: number) {
  for (let h2 = h; h2 >= Math.min(minH, h); h2--)
    for (let w2 = w; w2 >= Math.min(minW, w); w2--)
      for (let y = 0; y + h2 <= ROWS; y++)
        for (let x = 0; x + w2 <= COLS; x++)
          if (!overlaps(page, null, x, y, w2, h2)) return { x, y, w: w2, h: h2 }
  return null
}

export const newId = () => Math.random().toString(36).slice(2, 10)

/** A widget from the catalogue at its default size, in the first free spot. */
export function placeNew(page: Page, spec: WidgetSpec): WidgetInst | null {
  const spot = freeSpot(page, spec.w, spec.h, spec.minW, spec.minH)
  return spot && { id: newId(), type: spec.type, ...spot, options: {} }
}

/** Is a rectangle on the grid, at least the widget's minimum size, and clear of the others? */
export function fits(page: Page, w: WidgetInst, spec: WidgetSpec | undefined, r: { x: number; y: number; w: number; h: number }): boolean {
  if (r.x < 0 || r.y < 0 || r.x + r.w > COLS || r.y + r.h > ROWS) return false
  if (spec && (r.w < Math.min(spec.minW, COLS) || r.h < Math.min(spec.minH, ROWS))) return false
  return !overlaps(page, w.id, r.x, r.y, r.w, r.h)
}

/** Lowercase slug for ids made from titles/labels, unique among `taken`. */
export function slugId(text: string, taken: Set<string>, fallback = 'item'): string {
  const base = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback
  let id = base
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`
  return id
}
