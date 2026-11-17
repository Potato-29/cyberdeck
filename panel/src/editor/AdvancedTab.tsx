import { useEffect, useState } from 'react'
import type { Config } from '../types'
import { useToast } from '../ui/Toast'
import { useEditor } from './ctx'

/** The raw draft as JSON. Apply puts it in the draft; the hub validates it on Save. */
export function AdvancedTab() {
  const { d } = useEditor()
  const toast = useToast()
  const [text, setText] = useState(() => JSON.stringify(d.draft, null, 2))
  const [err, setErr] = useState('')
  useEffect(() => { setText(JSON.stringify(d.draft, null, 2)); setErr('') }, [d.draft])

  const apply = () => {
    try {
      const c = JSON.parse(text) as Config
      if (!c || !Array.isArray(c.pages) || !Array.isArray(c.shortcuts)) throw new Error('needs "pages" and "shortcuts" arrays')
      c.rev = d.saved?.rev ?? c.rev
      d.replace(c)
      toast('Applied to the draft', { text: 'Save to send it to the hub, which checks it.', level: 'ok' })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div>
      <div className="ed-h">
        <h1>Advanced</h1>
        <p className="dim">The whole layout as JSON (<code>~/panel.json</code> on the deck). Apply puts it in the draft; Save sends it, and the hub rejects anything that overlaps, leaves the grid or names an unknown widget or action.</p>
      </div>
      <textarea className="in json" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setErr('') }} />
      {err && <p className="bad">Not valid: {err}</p>}
      <div className="sc-row">
        <button className="btn primary" onClick={apply}>Apply</button>
        <button className="btn" onClick={() => setText(JSON.stringify(d.draft, null, 2))}>Reset</button>
        <button className="btn" onClick={() => {
          const blob = new Blob([JSON.stringify(d.draft, null, 1)], { type: 'application/json' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = 'panel.json'
          a.click()
          URL.revokeObjectURL(a.href)
        }}>Download</button>
      </div>
    </div>
  )
}
