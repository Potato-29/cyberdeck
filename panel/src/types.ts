// Shapes of panel.json and the catalogue (panel/widgets.json, templates.json).

export interface WidgetInst {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  options?: Record<string, unknown>
}

export interface Page {
  id: string
  title: string
  icon?: string
  shown?: boolean
  widgets: WidgetInst[]
}

export type ShortcutKind =
  | 'action' | 'pc_app' | 'service_restart' | 'service_stop'
  | 'feed' | 'spotify' | 'goto' | 'push' | 'url'

export interface Shortcut {
  id: string
  label: string
  icon?: string
  color?: string
  confirm?: boolean
  do: { kind: ShortcutKind; ref: string; value?: string; ttl?: number }
}

export interface Config {
  rev: number
  home?: string
  idleMinutes?: number
  pages: Page[]
  shortcuts: Shortcut[]
}

export interface OptionSpec {
  key: string
  label: string
  type: 'bool' | 'text' | 'number' | 'select' | 'metric' | 'shortcut' | 'shortcuts' | 'pushkey' | 'lines' | 'color'
  default?: unknown
  min?: number
  max?: number
  empty?: boolean
  choices?: [string, string][]
}

export interface WidgetSpec {
  type: string
  category: string
  name: string
  icon: string
  desc: string
  w: number
  h: number
  minW: number
  minH: number
  options: OptionSpec[]
}

export interface Template {
  id: string
  title: string
  icon: string
  desc: string
  widgets: Omit<WidgetInst, 'id'>[]
}

export interface Catalog {
  widgets: WidgetSpec[]
  templates: Template[]
  kinds: ShortcutKind[]
}

export interface Pushed {
  value?: unknown
  title?: string
  sub?: string
  unit?: string
  icon?: string
  color?: string
  level?: 'ok' | 'warn' | 'error' | 'info'
  progress?: number
  items?: (string | { label: string; value?: unknown; level?: string })[]
  ts: number
  expires?: number
}

export interface PanelEvent {
  seq: number
  kind: 'notify' | 'goto'
  ts: number
  title?: string
  text?: string
  level?: 'ok' | 'warn' | 'error' | 'info'
  seconds?: number
  page?: string
  countdown?: number
}

export const COLS = 12
export const ROWS = 6

/** An option's value, falling back to the catalogue default. */
export function opt<T>(w: WidgetInst, spec: WidgetSpec | undefined, key: string): T {
  const v = w.options?.[key]
  if (v !== undefined) return v as T
  return spec?.options.find((o) => o.key === key)?.default as T
}
