import { useState } from 'react'
import Brand from '../components/Brand.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const metrics = ['Total Interviews', 'Selected Interviews', 'Rejected Interviews', 'Pending Interviews']
const sections = [
  ['readiness', 'Interview Readiness', 'Readiness insights will be available in a future module.'],
  ['interviews', 'Recent Interviews', 'Your workspace has no interview records yet.'],
  ['weaknesses', 'Weakness Analysis', 'Weakness analysis will be available in a future module.'],
  ['recommendations', 'AI Recommendations', 'AI recommendations will be available in a future module.'],
]

export default function Dashboard() {
  const { user } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const fullName = user.user_metadata?.full_name
  const displayName = typeof fullName === 'string' && fullName.trim() ? fullName : 'InterTrap member'

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
    <div className="dashboard">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Dashboard navigation">
          <a href="#overview">Overview</a>
          {sections.map(([id, title]) => <a key={id} href={'#' + id}>{title}</a>)}
        </nav>
        <div className="account">
          <strong>{displayName}</strong>
          <p>{user.email}</p>
          <button type="button" className="button secondary" onClick={logout} disabled={pending}>
            {pending ? 'Logging out...' : 'Log out'}
          </button>
          {error && <p className="feedback error" role="alert">{error}</p>}
        </div>
      </aside>
      <main className="dashboard-main" id="overview">
        <header>
          <h1>Welcome, {displayName}</h1>
          <p>Your interview workspace</p>
        </header>
        <dl className="metrics">
          {metrics.map((title) => (
            <div className="card" key={title}>
              <dt>{title}</dt>
              <dd>0</dd>
            </div>
          ))}
        </dl>
        <div className="dashboard-sections">
          {sections.map(([id, title, description]) => (
            <section className="card" id={id} key={id}>
              <h2>{title}</h2>
              <p>{description}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
