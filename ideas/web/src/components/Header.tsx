import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Menu } from './Menu'

function ThemeIcon({ mode }: { mode: string }) {
  if (mode === 'light') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (mode === 'dark') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Header() {
  const { user, logout } = useAuth()
  const { mode, cycle } = useTheme()
  const navigate = useNavigate()

  return (
    <header className="header">
      <Link to="/" className="wordmark">
        ideas
      </Link>
      <span className="spacer" />

      <button
        className="icon-btn"
        onClick={cycle}
        title={`Theme: ${mode}`}
        aria-label={`Theme: ${mode}. Click to change.`}
      >
        <ThemeIcon mode={mode} />
      </button>

      {user && (
        <Menu label={user.display_name || user.email.split('@')[0]}>
          {(close) => (
            <>
              <Link className="menu-item" to="/settings" onClick={close}>
                Settings
              </Link>
              <Link className="menu-item" to="/?archived=1" onClick={close}>
                Archive
              </Link>
              <button
                className="menu-item"
                onClick={async () => {
                  close()
                  await logout()
                  navigate('/login')
                }}
              >
                Sign out
              </button>
            </>
          )}
        </Menu>
      )}
    </header>
  )
}
