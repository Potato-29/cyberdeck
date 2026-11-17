import { useData } from '../data'
import { METRIC, fmt, frac, type Metric } from '../metrics'
import { opt } from '../types'
import { Ring } from '../ui/Ring'
import { Spark } from '../ui/Spark'
import type { WidgetProps } from './types'

function useMetric(key: string): { m?: Metric; v: number | null; sub: string } {
  const { dash } = useData()
  const m = METRIC[key]
  const d = dash.data
  if (!m || !d) return { m, v: null, sub: '' }
  return { m, v: m.get(d), sub: m.sub?.(d) ?? '' }
}

function Missing({ what }: { what: string }) {
  return <div className="empty">Pick a {what} in the editor</div>
}

export function Gauge({ w, spec }: WidgetProps) {
  const { m, v, sub } = useMetric(opt<string>(w, spec, 'metric'))
  if (!m) return <Missing what="reading" />
  return (
    <div className="gauge">
      <Ring frac={frac(m, v)} color={m.color}>
        <span className="gauge-v">{fmt(m, v)}<small>{v == null ? '' : m.unit}</small></span>
      </Ring>
      <div className="gauge-l" style={{ color: m.color }}>{m.short}</div>
      <div className="gauge-s dim">{v == null ? 'offline' : sub}</div>
    </div>
  )
}

export function Stat({ w, spec }: WidgetProps) {
  const key = opt<string>(w, spec, 'metric')
  const { m, v, sub } = useMetric(key)
  const { history } = useData()
  if (!m) return <Missing what="reading" />
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-l" style={{ color: m.color }}>{m.short}</span>
        <span className="stat-s dim">{v == null ? 'offline' : sub}</span>
      </div>
      <div className="stat-v">{fmt(m, v)}<small>{v == null ? '' : m.unit}</small></div>
      {opt<boolean>(w, spec, 'spark') && (
        <div className="stat-spark"><Spark series={[{ values: history[key] ?? [], min: m.min, max: m.max, color: m.color }]} /></div>
      )}
    </div>
  )
}

export function Chart({ w, spec }: WidgetProps) {
  const { dash, history } = useData()
  const keys = ['metric', 'metric2', 'metric3'].map((k) => opt<string>(w, spec, k)).filter((k) => k && METRIC[k])
  if (!keys.length) return <Missing what="reading" />
  return (
    <div className="chart">
      <div className="chart-legend">
        {keys.map((k) => {
          const m = METRIC[k]
          const v = dash.data ? m.get(dash.data) : null
          return (
            <span key={k}><i style={{ background: m.color }} />{m.short} <b>{fmt(m, v)}{v == null ? '' : m.unit}</b></span>
          )
        })}
      </div>
      <div className="chart-plot">
        <Spark series={keys.map((k) => ({ values: history[k] ?? [], min: METRIC[k].min, max: METRIC[k].max, color: METRIC[k].color }))} />
      </div>
    </div>
  )
}
