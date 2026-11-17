import { Component, type CSSProperties, type ReactNode } from 'react'
import { usePanel } from '../ctx'
import type { Page, WidgetInst } from '../types'
import { WIDGETS } from '../widgets'

class Boundary extends Component<{ children: ReactNode; name: string }, { err: string }> {
  state = { err: '' }
  static getDerivedStateFromError(e: Error) { return { err: e.message } }
  render() {
    return this.state.err ? <div className="empty">{this.props.name} failed: {this.state.err}</div> : this.props.children
  }
}

/**
 * One page: a 12 × 6 CSS grid. Each widget is placed by its x/y/w/h. In
 * portrait the same widgets stack two-up in reading order (PhoneBox's
 * portraitLayout), sized by their height.
 */
export function Grid({ page }: { page: Page }) {
  const { specs } = usePanel()
  return (
    <div className="grid">
      {page.widgets.map((w) => <Cell key={w.id} w={w} name={specs[w.type]?.name ?? w.type} />)}
    </div>
  )
}

function Cell({ w, name }: { w: WidgetInst; name: string }) {
  const { specs } = usePanel()
  const def = WIDGETS[w.type]
  const style = {
    '--gc': `${w.x + 1} / span ${w.w}`,
    '--gr': `${w.y + 1} / span ${w.h}`,
    '--pc': `span ${w.w >= 6 ? 2 : 1}`,
    '--pr': `span ${w.h}`,
    order: w.y * 12 + w.x,
  } as CSSProperties
  return (
    <div className={'cell ' + (def?.bare ? 'bare' : 'tile') + ' t-' + w.type} style={style}>
      <Boundary name={name}>
        {def ? <def.C w={w} spec={specs[w.type]} /> : <div className="empty">Unknown widget “{w.type}”</div>}
      </Boundary>
    </div>
  )
}
