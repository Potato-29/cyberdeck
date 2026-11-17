import { useCallback, useRef, useState } from 'react'
import type { Config } from '../types'

const clone = <T,>(v: T): T => structuredClone(v)

/**
 * The editor's draft: every change goes through `edit`, which keeps an undo
 * stack (Ctrl+Z). `saved` is what the hub has; dirty = draft differs from it.
 */
export function useDraft() {
  const [saved, setSaved] = useState<Config | null>(null)
  const [draft, setDraft] = useState<Config | null>(null)
  const past = useRef<Config[]>([])

  const load = useCallback((cfg: Config) => {
    setSaved(cfg)
    setDraft(clone(cfg))
    past.current = []
  }, [])

  /** Apply a change to a copy of the draft. The callback may mutate its argument. */
  const edit = useCallback((fn: (c: Config) => void) => {
    setDraft((d) => {
      if (!d) return d
      const next = clone(d)
      fn(next)
      past.current = [...past.current.slice(-49), d]
      return next
    })
  }, [])

  const replace = useCallback((cfg: Config) => {
    setDraft((d) => {
      if (d) past.current = [...past.current.slice(-49), d]
      return clone(cfg)
    })
  }, [])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev) setDraft(prev)
  }, [])

  const dirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft)
  return { saved, draft, dirty, load, edit, replace, undo, canUndo: past.current.length > 0 }
}

export type Draft = ReturnType<typeof useDraft>
