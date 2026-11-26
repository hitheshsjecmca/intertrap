import { Link } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const features = [
  ['Interview tracking', 'Keep a record of companies, interview rounds, and outcomes in one workspace.'],
  ['Weakness identification', 'Use notes from each round to spot topics and skills that need more practice.'],
  ['Performance analytics', 'Review trends in your results as your interview history grows.'],
  ['AI-powered recommendations', 'Get suggestions for what to practice based on your interview feedback.'],
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
          <h1>Build Yourself.</h1>
          <p>InterTrap is an interview workspace designed to help you track each round, learn from feedback, and prepare for the next opportunity.</p>
        </section>
        <section className="features" aria-labelledby="features-title">
          <h2 id="features-title">Coming to InterTrap</h2>
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
