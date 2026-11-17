// The token arrives on the page's own URL (/panel?token=...) and is re-sent on
// every call, same as apiUrl() in hud/ and dashboard.html. Never baked in.
export const TOKEN = new URLSearchParams(location.search).get('token') ?? ''

type Params = Record<string, string | number | boolean>

export function apiUrl(path: string, params: Params = {}): string {
  const u = new URL(path, location.origin)
  u.searchParams.set('token', TOKEN)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  return u.toString()
}

export async function getJson<T>(path: string, params?: Params): Promise<T> {
  const resp = await fetch(apiUrl(path, params))
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.json() as Promise<T>
}

/** Fire a control endpoint; throws with the server's message on any failure shape. */
export async function call(
  path: string,
  params: Params = {},
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
  body?: unknown,
): Promise<Record<string, unknown>> {
  const resp = await fetch(apiUrl(path, params), {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let d: Record<string, unknown> = {}
  try { d = await resp.json() } catch { /* non-JSON error page */ }
  if (!resp.ok || d.error || d.status === 'error') {
    const err = new Error(String(d.message ?? d.error ?? 'HTTP ' + resp.status)) as Error & { status?: number; data?: unknown }
    err.status = resp.status
    err.data = d
    throw err
  }
  return d
}

// ── Response shapes (webhook_new.py) ──────────────────────

export type ServiceState = 'running' | 'down' | 'online' | 'offline'
export const isUp = (s?: ServiceState) => s === 'running' || s === 'online'

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
export interface DeckApp { key: string; label?: string; icon?: string; running?: boolean; closable?: boolean }
export interface DeckApps { online: boolean; apps?: DeckApp[] }
export interface AudioStatus { online?: boolean; mic_muted?: boolean; speaker_muted?: boolean }

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

/** LibreHardwareMonitor values come through as strings like "45.3 °C". */
export function num(v?: string | number | null): number | null {
  if (v == null || v === '--') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}
