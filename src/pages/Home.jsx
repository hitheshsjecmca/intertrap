import { Link } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import { IntelligenceCore } from '../components/ui/HudVisuals.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const features = [
  ['Interview previews', 'Configure companies, interview rounds and outcomes in a single draft.'],
  ['Weakness identification', 'Use notes from each round to spot topics and skills that need more practice.'],
  ['Performance analytics', 'Trend reporting is planned for a future module.'],
  ['I.R.I.S. guidance', 'Find your way around the workspace and prepare an interview preview.'],
]

export default function Home() {
  const { user, loading } = useAuth()

  return (
    <>
      <header className="site-header">
        <nav className="shell top-nav" aria-label="Main navigation">
          <Brand />
          <div className="actions">
            {!loading && (user ? (
              <Link className="button" to="/dashboard">Dashboard</Link>
            ) : (
              <>
                <Link className="button secondary" to="/login">Log in</Link>
                <Link className="button" to="/register">Get started</Link>
              </>
            ))}
          </div>
        </nav>
      </header>
      <main className="shell">
        <section className="hero">
          <div>
            <h1>Build <span className="hero-accent">Yourself.</span></h1>
            <p>Map your interview rounds, identify topics to practise, and review your next steps in one workspace.</p>
            {!loading && <div className="actions">
              <Link className="button" to={user ? '/dashboard' : '/register'}>
                {user ? 'Open command center' : 'Create your workspace'}
              </Link>
            </div>}
          </div>
          <div className="hero-visual">
            <IntelligenceCore />
            <p>I.R.I.S. · Interview Readiness Intelligence System</p>
          </div>
        </section>
        <section className="features" aria-labelledby="features-title">
          <h2 id="features-title">The InterTrap workspace</h2>
          <div className="feature-grid">
            {features.map(([title, description]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
