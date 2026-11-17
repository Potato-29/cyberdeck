import { useState, type CSSProperties } from 'react'
import { call } from '../api'
import { usePanel } from '../ctx'
import type { Shortcut } from '../types'
import { useConfirm } from './Confirm'
import { useToast } from './Toast'

/** Key colour → the tinted-key look: colour at low alpha for fill, stronger for the border. */
export function tint(color = '#8e8e93'): CSSProperties {
  return { '--k': color } as CSSProperties
}

/** Run one shortcut: confirm if asked, open URLs here, switch pages locally, the rest via /panel/key. */
export function useRunKey() {
  const { goto } = usePanel()
  const confirm = useConfirm()
  const toast = useToast()
  return async (k: Shortcut): Promise<boolean> => {
    if (k.confirm && !(await confirm({ title: `${k.icon ?? ''} ${k.label}`.trim(), body: 'Run this shortcut?', action: 'Run', danger: k.do.kind === 'service_stop' }))) {
      return false
    }
    if (k.do.kind === 'url') { window.open(k.do.ref, '_blank', 'noopener'); return true }
    if (k.do.kind === 'goto') { goto(k.do.ref); return true }
    try {
      await call('/panel/key/' + encodeURIComponent(k.id))
      return true
    } catch (e) {
      toast(k.label, { text: (e as Error).message, level: 'error', seconds: 4 })
      return false
    }
  }
}

export function KeyButton({ k, big }: { k: Shortcut; big?: boolean }) {
  const run = useRunKey()
  const [state, setState] = useState<'' | 'busy' | 'ok' | 'err'>('')
  const press = async () => {
    if (state === 'busy') return
    setState('busy')
    const ok = await run(k)
    setState(ok ? 'ok' : 'err')
    window.setTimeout(() => setState(''), 700)
  }
  return (
    <button className={'key' + (big ? ' big' : '') + (state ? ' ' + state : '')} style={tint(k.color)} onClick={press}>
      {k.icon && <span className="key-ic">{k.icon}</span>}
      <span className="key-l">{k.label}</span>
    </button>
  )
}
