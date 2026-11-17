import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type Level = 'ok' | 'warn' | 'error' | 'info'
interface Toast { id: number; title: string; text?: string; level: Level }
type ToastFn = (title: string, opts?: { text?: string; level?: Level; seconds?: number }) => void

const Ctx = createContext<ToastFn>(() => {})
export const useToast = () => useContext(Ctx)

const ICON: Record<Level, string> = { ok: '✓', warn: '!', error: '✕', info: 'i' }

/** Stacked toasts, top right. At most four; the oldest drops off. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const next = useRef(1)
  const drop = useCallback((id: number) => setList((l) => l.filter((t) => t.id !== id)), [])
  const toast = useCallback<ToastFn>((title, o = {}) => {
    const id = next.current++
    setList((l) => [...l.slice(-3), { id, title, text: o.text, level: o.level ?? 'info' }])
    window.setTimeout(() => drop(id), (o.seconds ?? 3) * 1000)
  }, [drop])

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={'toast lv-' + t.level} onClick={() => drop(t.id)}>
            <span className="toast-ic">{ICON[t.level]}</span>
            <div>
              <div className="toast-t">{t.title}</div>
              {t.text && <div className="toast-x">{t.text}</div>}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
