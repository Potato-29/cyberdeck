import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Ask { title: string; body?: string; action: string; danger?: boolean }
type ConfirmFn = (a: Ask) => Promise<boolean>
const Ctx = createContext<ConfirmFn>(() => Promise.resolve(true))

/** `if (await confirm({...}))` — a replacement for window.confirm (same idea as hud/ui/Sheet.tsx). */
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const settle = useRef<(ok: boolean) => void>(() => {})
  const confirm = useCallback<ConfirmFn>((a) => new Promise((resolve) => {
    settle.current = (ok) => { setAsk(null); resolve(ok) }
    setAsk(a)
  }), [])

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {ask && (
        <div className="scrim fade" onClick={() => settle.current(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="dialog-t">{ask.title}</div>
            {ask.body && <p className="dialog-x">{ask.body}</p>}
            <div className="dialog-row">
              <button className="btn" onClick={() => settle.current(false)}>Cancel</button>
              <button className={'btn ' + (ask.danger ? 'danger' : 'primary')} autoFocus onClick={() => settle.current(true)}>
                {ask.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
