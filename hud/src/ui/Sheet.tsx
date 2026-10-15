import { AnimatePresence, m } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

/** Detail sheet that morphs out of the tile sharing its layoutId. */
export function Sheet({ id, open, onClose, children }: {
  id: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div className="scrim" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <div className="sheet-wrap">
            <m.div className="sheet" layoutId={'tile-' + id} transition={spring}>
              <m.div
                style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
              >
                {children}
              </m.div>
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Confirm: an animated replacement for window.confirm ──

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
      <AnimatePresence>
        {ask && (
          <>
            <m.div className="scrim" onClick={() => settle.current(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <div className="sheet-wrap">
              <m.div className="sheet confirm"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={spring}
              >
                <h3>{ask.title}</h3>
                <p>{ask.body}</p>
                <div className="row">
                  <m.button className="chip" whileTap={{ scale: 0.95 }} onClick={() => settle.current(false)}>Cancel</m.button>
                  <m.button className={'chip ' + (ask.danger ? 'danger' : '')} whileTap={{ scale: 0.95 }}
                    onClick={() => settle.current(true)}>{ask.action}</m.button>
                </div>
              </m.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  )
}
