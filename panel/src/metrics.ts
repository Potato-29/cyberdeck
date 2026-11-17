import { num, type DashboardData } from './api'

// Every reading a gauge, metric tile or chart can show, keyed flat so the
// editor can offer one list. One hue per reading, as in PhoneBox.
export interface Metric {
  key: string
  label: string
  short: string
  unit: string
  min: number
  max: number
  color: string
  get: (d: DashboardData) => number | null
  sub?: (d: DashboardData) => string
}

const pc = (d: DashboardData) => (d.pc_stats?.online ? d.pc_stats : undefined)
const deg = (v: number | null) => (v == null ? '' : Math.round(v) + '°C')

export const METRICS: Metric[] = [
  { key: 'pc.cpu', label: 'PC CPU load', short: 'CPU', unit: '%', min: 0, max: 100, color: '#2dd4bf',
    get: (d) => num(pc(d)?.cpu_load), sub: (d) => deg(num(pc(d)?.cpu_temp)) },
  { key: 'pc.gpu', label: 'PC GPU load', short: 'GPU', unit: '%', min: 0, max: 100, color: '#84cc16',
    get: (d) => num(pc(d)?.gpu_load), sub: (d) => deg(num(pc(d)?.gpu_temp)) },
  { key: 'pc.ram', label: 'PC RAM used', short: 'RAM', unit: '%', min: 0, max: 100, color: '#a78bfa',
    get: (d) => num(pc(d)?.ram_load) },
  { key: 'pc.cpu_temp', label: 'PC CPU temperature', short: 'CPU temp', unit: '°C', min: 20, max: 100, color: '#fb923c',
    get: (d) => num(pc(d)?.cpu_temp) },
  { key: 'pc.gpu_temp', label: 'PC GPU temperature', short: 'GPU temp', unit: '°C', min: 20, max: 100, color: '#f97316',
    get: (d) => num(pc(d)?.gpu_temp), sub: (d) => { const f = num(pc(d)?.cpu_fan); return f == null ? '' : `Fan ${Math.round(f)} rpm` } },
  { key: 'pc.fan', label: 'PC CPU fan', short: 'Fan', unit: 'rpm', min: 0, max: 3000, color: '#22d3ee',
    get: (d) => num(pc(d)?.cpu_fan) },
  { key: 'deck.cpu', label: 'Deck CPU load', short: 'Deck CPU', unit: '%', min: 0, max: 100, color: '#38bdf8',
    get: (d) => num(d.resources?.cpu) },
  { key: 'deck.ram', label: 'Deck memory used', short: 'Deck RAM', unit: '%', min: 0, max: 100, color: '#f472b6',
    get: (d) => num(d.resources?.mem_pct), sub: (d) => d.system?.memory ?? '' },
  { key: 'deck.disk', label: 'Deck storage used', short: 'Disk', unit: '%', min: 0, max: 100, color: '#fbbf24',
    get: (d) => num(d.resources?.disk_pct), sub: (d) => d.system?.disk ?? '' },
  { key: 'deck.battery', label: 'Deck battery', short: 'Battery', unit: '%', min: 0, max: 100, color: '#4ade80',
    get: (d) => num(d.battery?.level), sub: (d) => [d.battery?.status?.toLowerCase(), deg(num(d.battery?.temperature))].filter(Boolean).join(' · ') },
  { key: 'deck.battery_temp', label: 'Deck battery temperature', short: 'Batt temp', unit: '°C', min: 15, max: 55, color: '#facc15',
    get: (d) => num(d.battery?.temperature) },
  { key: 'deck.wifi', label: 'Deck Wi-Fi signal', short: 'Wi-Fi', unit: 'dBm', min: -100, max: -30, color: '#60a5fa',
    get: (d) => num(d.wifi?.rssi), sub: (d) => d.wifi?.ssid ?? '' },
]

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<string, Metric>

/** 0..1 position of a value within the metric's range. */
export const frac = (m: Metric, v: number | null) =>
  v == null ? 0 : Math.max(0, Math.min(1, (v - m.min) / (m.max - m.min)))

export function fmt(m: Metric, v: number | null): string {
  if (v == null) return '–'
  if (m.unit === 'rpm') return String(Math.round(v))
  return Math.abs(v) < 10 && m.unit !== 'dBm' ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v))
}
