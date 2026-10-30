// The token arrives on the page's own URL (/hud?token=...) and is re-sent on
// every call, same as apiUrl() in dashboard.html. Never baked into the bundle.
const TOKEN = new URLSearchParams(location.search).get('token') ?? ''

export function apiUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
  const u = new URL(path, location.origin)
  u.searchParams.set('token', TOKEN)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  return u.toString()
}

export async function getJson<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const resp = await fetch(apiUrl(path, params))
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.json() as Promise<T>
}

/** Fire a control endpoint; throws with the server's message on any failure shape. */
export async function call(
  path: string,
  params: Record<string, string | number | boolean> = {},
  method: 'GET' | 'POST' = 'POST',
): Promise<Record<string, unknown>> {
  const resp = await fetch(apiUrl(path, params), { method })
  let d: Record<string, unknown> = {}
  try { d = await resp.json() } catch { /* non-JSON error page */ }
  if (!resp.ok || d.error || d.status === 'error') {
    throw new Error(String(d.message ?? d.error ?? 'HTTP ' + resp.status))
  }
  return d
}

// ── Response shapes (webhook_new.py) ──────────────────────

export type ServiceState = 'running' | 'down' | 'online' | 'offline'

export interface DashboardData {
  services?: Record<string, ServiceState>
  service_meta?: { key: string; label: string; alert: boolean }[]
  battery?: { level?: number; status?: string; health?: string; temperature?: number }
  wifi?: { ssid?: string; ip?: string; rssi?: number; speed_mbps?: number }
  system?: { uptime?: string; disk?: string; memory?: string }
  resources?: { cpu?: number; mem_pct?: number; disk_pct?: number }
  pc_stats?: {
    online: boolean
    cpu_temp?: string; cpu_load?: string; gpu_temp?: string
    gpu_load?: string; ram_load?: string; cpu_fan?: string
  }
  weather?: { temp?: number; feels_like?: number; humidity?: number; description?: string }
  rss?: { title: string; link: string; published: string }[]
}

export interface Action { key: string; label: string; confirm: boolean }
export interface DeckApp { key: string; label?: string; running?: boolean; closable?: boolean }
export interface DeckApps { online: boolean; apps?: DeckApp[] }
export interface AudioStatus { online?: boolean; mic_muted?: boolean; speaker_muted?: boolean }

export const isUp = (s?: ServiceState) => s === 'running' || s === 'online'

/** LibreHardwareMonitor values come through as strings like "45.3 °C". */
export function splitReading(v?: string | number): { n: number | null; unit: string } {
  if (v == null || v === '--') return { n: null, unit: '' }
  const s = String(v)
  const n = parseFloat(s)
  return { n: Number.isFinite(n) ? n : null, unit: s.replace(/^[\s\d.,-]+/, '').trim() }
}

export interface SpotifyNow {
  configured: boolean
  active?: boolean
  playing?: boolean
  title?: string
  artist?: string
  album?: string
  art?: string
  art_small?: string
  progress_ms?: number
  duration_ms?: number
  device?: string
  volume?: number | null
  supports_volume?: boolean
}
