import { createContext, useContext } from 'react'
import type { Config, WidgetSpec } from './types'

/** What a widget can reach besides data: the layout, the catalogue, and the panel's own actions. */
export interface PanelApi {
  config: Config
  specs: Record<string, WidgetSpec>
  goto: (pageId: string) => void
  /** True inside the editor's live preview. */
  preview?: boolean
}

export const PanelCtx = createContext<PanelApi | null>(null)

export function usePanel(): PanelApi {
  const p = useContext(PanelCtx)
  if (!p) throw new Error('usePanel outside PanelCtx')
  return p
}
