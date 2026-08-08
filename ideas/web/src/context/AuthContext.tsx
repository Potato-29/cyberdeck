import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, type User } from '../lib/api'

interface AuthValue {
  user: User | null
  signupMode: string
  loading: boolean
  setUser: (u: User | null) => void
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [signupMode, setSignupMode] = useState('open')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await api.me()
      setUser(res.user)
      setSignupMode(res.signup_mode)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <Ctx.Provider value={{ user, signupMode, loading, setUser, refresh, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
