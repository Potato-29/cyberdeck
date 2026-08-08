import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export function Settings() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showToken, setShowToken] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await api.changePassword(current, next)
      setMsg('Password updated.')
      setCurrent('')
      setNext('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <main className="shell" style={{ maxWidth: 480 }}>
      <h1 className="serif" style={{ fontSize: 28, marginBottom: 'var(--s2)' }}>
        Settings
      </h1>
      <p className="muted small" style={{ marginBottom: 'var(--s6)' }}>
        Signed in as {user.email}
      </p>

      <h2 className="label" style={{ fontSize: 14 }}>
        Change password
      </h2>
      <form className="stack" onSubmit={submit} style={{ gap: 'var(--s3)' }}>
        {error && <div className="error-note">{error}</div>}
        {msg && <p className="small muted">{msg}</p>}
        <input
          className="field"
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
        <input
          className="field"
          type="password"
          placeholder="New password (8+ characters)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <div>
          <button className="btn" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>

      <hr className="divider" />

      <h2 className="label" style={{ fontSize: 14 }}>
        Quick-capture token
      </h2>
      <p className="small muted" style={{ marginBottom: 'var(--s3)' }}>
        POST to <code>/api/capture</code> with an <code>X-Api-Token</code> header to park an
        idea from a script. Treat it like a password.
      </p>
      <div className="share-box">
        <code>{showToken ? user.api_token : '•'.repeat(24)}</code>
        <button className="btn btn-ghost" onClick={() => setShowToken((s) => !s)}>
          {showToken ? 'Hide' : 'Show'}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => void navigator.clipboard.writeText(user.api_token).catch(() => {})}
        >
          Copy
        </button>
      </div>

      <hr className="divider" />
      <Link to="/" className="small">
        Back to the board
      </Link>
    </main>
  )
}
