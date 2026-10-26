import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

/** Plain modal: scrim + box, 120ms opacity fade in via CSS (.pop). */
export function Modal({ open, onClose, wide, children }: {
  open: boolean
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className={'modal pop' + (wide ? ' wide' : '')}>{children}</div>
      </div>
    </>
  )
}

// ── Confirm: a replacement for window.confirm ──

interface Ask { title: string; body: string; action: string; danger?: boolean }
type ConfirmFn = (a: Ask) => Promise<void>
const Ctx = createContext<ConfirmFn>(() => Promise.resolve())

/** `await confirm(...)` resolves on yes and rejects with Error('cancelled') on no. */
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const settle = useRef<(ok: boolean) => void>(() => {})

  const confirm = useCallback<ConfirmFn>((a) => new Promise((resolve, reject) => {
    settle.current = (ok) => {
      setAsk(null)
      if (ok) resolve()
      else reject(new Error('cancelled'))
    }
    setAsk(a)
  }), [])

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal open={!!ask} onClose={() => settle.current(false)}>
        {ask && (
          <>
            <div className="lbl" style={{ marginBottom: 8 }}>{ask.title}</div>
            <p className="modal-body">{ask.body}</p>
            <div className="keys">
              <button className="key grow" onClick={() => settle.current(false)}>CANCEL</button>
              <button className={'key grow ' + (ask.danger ? 'bad' : 'acc')} onClick={() => settle.current(true)}>
                {ask.action.toUpperCase()}
              </button>
            </div>
          </>
        )}
      </Modal>
    </Ctx.Provider>
  )
}
