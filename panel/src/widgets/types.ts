import type { ComponentType } from 'react'
import type { WidgetInst, WidgetSpec } from '../types'

export interface WidgetProps { w: WidgetInst; spec?: WidgetSpec }
export interface WidgetDef {
  C: ComponentType<WidgetProps>
  /** Draw without the tile behind it (shortcut keys are tiles themselves). */
  bare?: boolean
}
