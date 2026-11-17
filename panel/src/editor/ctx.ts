import { createContext, useContext } from 'react'
import type { Action, DeckApp } from '../api'
import type { Catalog, Pushed, WidgetSpec } from '../types'
import type { Draft } from './state'

export interface Refs {
  actions: Action[]
  apps: DeckApp[]
  appsOnline: boolean
  services: string[]
  pushes: Record<string, Pushed>
  refreshPushes: () => void
}

export interface EditorApi {
  d: Draft
  catalog: Catalog
  specs: Record<string, WidgetSpec>
  refs: Refs
}

export const EditorCtx = createContext<EditorApi | null>(null)
export function useEditor(): EditorApi {
  const e = useContext(EditorCtx)
  if (!e) throw new Error('useEditor outside EditorCtx')
  return e
}
