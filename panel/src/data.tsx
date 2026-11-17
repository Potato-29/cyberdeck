import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getJson, type AudioStatus, type DashboardData, type DeckApps, type SpotifyNow } from './api'
import { usePoll } from './hooks/usePoll'
import { METRICS } from './metrics'
import type { PanelEvent, Pushed } from './types'

// Cadences match hud/: 4s for the aggregate, 8s for the PC link, 3s for
// Spotify. Anything only one widget type uses is polled only while a widget
// of that type is on screen (PhoneBox: "the agent samples only what is on
// screen").
const HISTORY = 90 // samples kept per reading: 6 minutes at 4s

function useStore(types: Set<string>, notes: PanelEvent[]) {
  const dash = usePoll(() => getJson<DashboardData>('/dashboard/data'), 4000)
  const spotify = usePoll(() => getJson<SpotifyNow>('/spotify/now'), 3000, types.has('media'))
  const apps = usePoll(() => getJson<DeckApps>('/deck/apps'), 8000, types.has('launcher'))
  const audio = usePoll(() => getJson<AudioStatus>('/audio/status'), 8000, types.has('audio'))
  const push = usePoll(() => getJson<Record<string, Pushed>>('/panel/push'), 4000, types.has('pushed'))
  const feeder = usePoll(() => getJson<{ status: string; esp32?: string }>('/feeder-status'), 30000, types.has('feeder'))

  // History for sparklines and charts, gathered on every dashboard poll
  // whatever page is open, so a chart has data the moment it appears.
  const hist = useRef<Record<string, number[]>>({})
  const [histRev, setHistRev] = useState(0)
  useEffect(() => {
    const d = dash.data
    if (!d) return
    for (const m of METRICS) {
      const v = m.get(d)
      if (v == null) continue
      const arr = (hist.current[m.key] ??= [])
      arr.push(v)
      if (arr.length > HISTORY) arr.shift()
    }
    setHistRev((r) => r + 1)
  }, [dash.data])

  return { dash, spotify, apps, audio, push, feeder, history: hist.current, histRev, notes }
}

type Store = ReturnType<typeof useStore>
const Ctx = createContext<Store | null>(null)

export function DataProvider({ types, notes, children }: { types: Set<string>; notes: PanelEvent[]; children: ReactNode }) {
  return <Ctx.Provider value={useStore(types, notes)}>{children}</Ctx.Provider>
}

export function useData(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useData outside DataProvider')
  return s
}
