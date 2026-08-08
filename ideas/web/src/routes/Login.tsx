import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export function Login() {
  const { setUser, signupMode } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.login(email, password)
      setUser(res.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <form className="auth-card stack" onSubmit={submit}>
        <h1 className="auth-title">Welcome back</h1>
        <p className="muted small" style={{ marginBottom: 'var(--s5)' }}>
          A quiet place to park ideas.
        </p>

        {error && <div className="error-note" style={{ marginBottom: 'var(--s4)' }}>{error}</div>}

        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="field"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          autoFocus
          style={{ marginBottom: 'var(--s4)' }}
        />

        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={{ marginBottom: 'var(--s5)' }}
        />

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {signupMode !== 'closed' && (
          <p className="small muted" style={{ marginTop: 'var(--s5)', textAlign: 'center' }}>
            No account? <Link to="/register">Create one</Link>
          </p>
        )}
      </form>
    </div>
  )
}
