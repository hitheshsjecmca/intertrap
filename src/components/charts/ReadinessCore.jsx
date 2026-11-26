import { ProgressDial } from '../ui/HudVisuals.jsx'
import { calculateReadiness, percent, READINESS } from '../../utils/analyticsMetrics.js'

export default function ReadinessCore({ categories }) {
  const score = calculateReadiness(categories)
  return <section className="ws-card hud-readiness data-readiness">
    <h2>Interview Readiness</h2>
    <div className="data-readiness-core">
      <span className="hud-core-ring hud-core-outer" aria-hidden="true" />
      <span className="hud-core-ring hud-core-middle" aria-hidden="true" />
      <ProgressDial value={score.value} label={`Readiness: ${percent(score.value)}`} />
    </div>
    <p>{score.value == null ? 'Insufficient data' : 'Estimated preparation indicator'}</p>
    <p>{percent(score.coverage)} coverage · {score.sample} assessed rounds</p>
    <details><summary>How readiness is calculated</summary>
      <p>Clearance rates are weighted across configured categories with at least {READINESS.minimum} attempted rounds. This estimate describes recorded preparation evidence. It is not a hiring probability.</p>
    </details>
  </section>
}
