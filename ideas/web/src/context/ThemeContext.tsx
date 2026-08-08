import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

type Mode = 'light' | 'dark' | 'system'
const KEY = 'ideas-theme'

const Ctx = createContext<{ mode: Mode; cycle: () => void } | null>(null)

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(read)

  useEffect(() => {
    const root = document.documentElement
    // Removing the attribute hands control back to prefers-color-scheme.
    if (mode === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', mode)
    try {
      if (mode === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, mode)
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, [mode])

  const cycle = useCallback(() => {
    setMode((m) => (m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system'))
  }, [])

  return <Ctx.Provider value={{ mode, cycle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme outside ThemeProvider')
  return v
}
