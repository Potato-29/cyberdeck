import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Header } from './components/Header'
import { useAuth } from './context/AuthContext'
import { Board } from './routes/Board'
import { IdeaDetail } from './routes/IdeaDetail'
import { Login } from './routes/Login'
import { PublicIdea } from './routes/PublicIdea'
import { Register } from './routes/Register'
import { Settings } from './routes/Settings'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Hold the render until /api/auth/me answers, otherwise a signed-in user
  // reloading a deep link gets bounced to /login for a frame.
  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  )
}

export function App() {
  const { user, loading } = useAuth()

  return (
    <Routes>
      {/* Public share links work signed out, and never show the app chrome. */}
      <Route path="/i/:slug" element={<PublicIdea />} />

      <Route
        path="/login"
        element={loading ? null : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={loading ? null : user ? <Navigate to="/" replace /> : <Register />}
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell>
              <Board />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/idea/:id"
        element={
          <RequireAuth>
            <Shell>
              <IdeaDetail />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Shell>
              <Settings />
            </Shell>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
