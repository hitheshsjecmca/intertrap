import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Brand from '../Brand.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'

const groups = [
  ['Workspace', [
    ['/dashboard', 'Dashboard', '▦'],
    ['/interviews/new', 'Add Interview', '+'],
    ['/interviews', 'Interview History', '◷'],
    ['/analytics', 'Performance Analytics', '↗'],
    ['/weaknesses', 'Weakness Analysis', '◎'],
    ['/ai-insights', 'AI Insights', '✧'],
  ]],
  ['Account', [
    ['/profile', 'Profile', '○'],
    ['/settings', 'Settings', '⚙'],
  ]],
]

export default function AppLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const fullName = user.user_metadata?.full_name
  const displayName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : 'InterTrap member'

  async function logout() {
    setPending(true)
    setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
    } catch {
      setError('Could not log out. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="workspace">
      <a className="ws-skip" href="#workspace-main">Skip to content</a>
      <aside className="ws-sidebar">
        <div className="ws-brand">
          <div><Brand /><p>Build Yourself</p></div>
          <button type="button" className="ws-button ws-secondary ws-menu"
            aria-expanded={menuOpen} aria-controls="workspace-navigation"
            onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close menu' : 'Menu'}</button>
        </div>
        <div className="ws-navigation" id="workspace-navigation" data-open={menuOpen}>
          <nav aria-label="Workspace navigation">
            {groups.map(([group, items]) => (
              <div className="ws-nav-group" key={group}>
                <p>{group}</p>
                {items.map(([path, label, icon]) => (
                  <NavLink end to={path} key={path} onClick={() => setMenuOpen(false)}>
                    <span aria-hidden="true">{icon}</span>{label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="ws-account">
            <strong>{displayName}</strong>
            <p>{user.email}</p>
            <LogoutButton pending={pending} logout={logout} />
            {error && <p className="ws-error" role="alert">{error}</p>}
          </div>
        </div>
      </aside>
      <main className="ws-main" id="workspace-main" tabIndex={-1}>
        <div className="hud-page" key={pathname}>
          <Outlet context={{ user, displayName, logout, pending, error }} />
        </div>
      </main>
    </div>
  )
}

export function LogoutButton({ pending, logout }) {
  return <button type="button" className="ws-button ws-secondary" disabled={pending}
    onClick={logout}>{pending ? 'Logging out…' : 'Log out'}</button>
}
