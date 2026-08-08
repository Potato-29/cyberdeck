import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export function Register() {
  const { setUser, signupMode } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (signupMode === 'closed') {
    return (
      <div className="center-page">
        <div className="auth-card">
          <h1 className="auth-title">Registration is closed</h1>
          <p className="muted small" style={{ marginBottom: 'var(--s5)' }}>
            This board isn't taking new accounts right now.
          </p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.register(email, password, name, invite || undefined)
      setUser(res.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <form className="auth-card stack" onSubmit={submit}>
        <h1 className="auth-title">Start a board</h1>
        <p className="muted small" style={{ marginBottom: 'var(--s5)' }}>
          Your ideas are private to you.
        </p>

        {error && <div className="error-note" style={{ marginBottom: 'var(--s4)' }}>{error}</div>}

        <label className="label" htmlFor="name">
          Name <span className="faint">(optional)</span>
        </label>
        <input
          id="name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          autoFocus
          style={{ marginBottom: 'var(--s4)' }}
        />

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
          style={{ marginBottom: 'var(--s4)' }}
        />

        <label className="label" htmlFor="password">
          Password <span className="faint">(8+ characters)</span>
        </label>
        <input
          id="password"
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          style={{ marginBottom: 'var(--s4)' }}
        />

        {signupMode === 'invite' && (
          <>
            <label className="label" htmlFor="invite">
              Invite code
            </label>
            <input
              id="invite"
              className="field"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              required
              style={{ marginBottom: 'var(--s4)' }}
            />
          </>
        )}

        <button
          className="btn btn-primary btn-block"
          disabled={busy}
          style={{ marginTop: 'var(--s2)' }}
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>

        <p className="small muted" style={{ marginTop: 'var(--s5)', textAlign: 'center' }}>
          Already have one? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
