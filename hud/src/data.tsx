import { createContext, useContext, type ReactNode } from 'react'
import { getJson, type Action, type AudioStatus, type DashboardData, type DeckApps } from './api'
import { usePoll } from './hooks/usePoll'

// Poll cadences match dashboard.html: 4s for the aggregate, 8s for the PC link.
function useDeckData() {
  return {
    dash: usePoll(() => getJson<DashboardData>('/dashboard/data'), 4000),
    apps: usePoll(() => getJson<DeckApps>('/deck/apps'), 8000),
    audio: usePoll(() => getJson<AudioStatus>('/audio/status'), 8000),
    actions: usePoll(() => getJson<Action[]>('/actions/list'), 60000),
  }
}

type Store = ReturnType<typeof useDeckData>
const Ctx = createContext<Store | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useDeckData()}>{children}</Ctx.Provider>
}

export function useData(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useData outside DataProvider')
  return s
}
