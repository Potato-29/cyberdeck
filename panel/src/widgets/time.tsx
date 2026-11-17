import { useData } from '../data'
import { useNow } from '../hooks/useNow'
import { opt } from '../types'
import type { WidgetProps } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function wxIcon(desc = ''): string {
  const d = desc.toLowerCase()
  if (/thunder/.test(d)) return '⛈️'
  if (/snow|sleet/.test(d)) return '🌨️'
  if (/rain|drizzle|shower/.test(d)) return '🌧️'
  if (/mist|fog|haze|smoke|dust/.test(d)) return '🌫️'
  if (/overcast|broken/.test(d)) return '☁️'
  if (/cloud/.test(d)) return '⛅'
  if (/clear|sun/.test(d)) return new Date().getHours() >= 19 || new Date().getHours() < 6 ? '🌙' : '☀️'
  return '🌡️'
}

export function Clock({ w, spec }: WidgetProps) {
  const seconds = opt<boolean>(w, spec, 'seconds')
  const now = useNow(seconds ? 1000 : 60000)
  const { dash } = useData()
  const wx = dash.data?.weather
  return (
    <div className="clock">
      <div className="clock-row">
        <span className="clock-t">{pad(now.getHours())}<span className="clock-colon">:</span>{pad(now.getMinutes())}</span>
        {seconds && <span className="clock-s">{pad(now.getSeconds())}</span>}
      </div>
      {opt<boolean>(w, spec, 'date') && (
        <div className="clock-d">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      )}
      {opt<boolean>(w, spec, 'weather') && wx?.temp != null && (
        <div className="clock-wx">
          <span className="clock-wx-ic">{wxIcon(wx.description)}</span>
          <span className="clock-wx-t">{wx.temp}°</span>
          <span className="dim">{wx.description}<br />Feels like {wx.feels_like}° · {wx.humidity}%</span>
        </div>
      )}
    </div>
  )
}

export function Analog({ w, spec }: WidgetProps) {
  const seconds = opt<boolean>(w, spec, 'seconds')
  const now = useNow(seconds ? 1000 : 10000)
  const label = opt<string>(w, spec, 'label')
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60
  const hand = (deg: number, len: number, cls: string) => (
    <line x1="50" y1="50" x2="50" y2={50 - len} className={cls} transform={`rotate(${deg} 50 50)`} />
  )
  return (
    <div className="analog">
      <svg viewBox="0 0 100 100" aria-label={now.toLocaleTimeString()}>
        <circle cx="50" cy="50" r="47" className="analog-face" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="7" x2="50" y2={i % 3 ? 11 : 14} className="analog-tick" transform={`rotate(${i * 30} 50 50)`} />
        ))}
        {hand(h * 30, 24, 'analog-h')}
        {hand(m * 6, 35, 'analog-m')}
        {seconds && hand(s * 6, 38, 'analog-sec')}
        <circle cx="50" cy="50" r="2.6" className="analog-pin" />
      </svg>
      {label && <div className="analog-l">{label}</div>}
    </div>
  )
}

export function Title({ w, spec }: WidgetProps) {
  return (
    <div className="title-w">
      <div className="title-t">{opt<string>(w, spec, 'text')}</div>
      {opt<string>(w, spec, 'sub') && <div className="title-s dim">{opt<string>(w, spec, 'sub')}</div>}
    </div>
  )
}
