import { Link, useOutletContext } from 'react-router-dom'
import { AddInterviewLink, EmptyState, PageHeading } from '../components/ui/WorkspaceUI.jsx'
import { ProgressDial, TelemetryGrid } from '../components/ui/HudVisuals.jsx'
import IrisAssistant from '../components/ui/IrisAssistant.jsx'

const metrics = [
  ['Total interviews', '▥', 'total'],
  ['Selected interviews', '✓', 'selected'],
  ['Rejected interviews', '×', 'rejected'],
  ['Pending interviews', '◷', 'pending'],
]

export default function Dashboard() {
  const { displayName } = useOutletContext()

  return <>
    <PageHeading title="Career Command Center" description={`Welcome, ${displayName}.`} action={<AddInterviewLink />} />
    <dl className="ws-metrics" aria-label="Interview statistics">
      {metrics.map(([title, icon, tone]) => <div className="ws-card ws-stat" data-tone={tone} key={title}>
        <dt>{title}<span className="hud-stat-icon" aria-hidden="true">{icon}</span></dt>
        <dd><span aria-hidden="true">—</span><span className="hud-sr">Insufficient data</span></dd>
      </div>)}
    </dl>
    <div className="hud-overview">
      <section className="ws-card hud-readiness">
        <h2>Interview Readiness</h2>
        <ProgressDial label="Readiness score unavailable" />
        <p>Insufficient data</p>
      </section>
      <section className="ws-card hud-skill">
        <h2>Skill Telemetry</h2>
        <TelemetryGrid />
        <p>Skill analytics will appear here when available.</p>
      </section>
      <IrisAssistant />
    </div>
    <div className="ws-grid hud-detail">
      <EmptyState title="First-Round Rejections">Insufficient data to analyse first-round rejections.</EmptyState>
      <EmptyState title="Selection Rate">Requires at least one final selection or rejection.</EmptyState>
      <section className="ws-card ws-empty">
        <h2>Interview Progression</h2>
        <p>Build a draft to see its round-by-round timeline.</p>
        <Link to="/interviews/new">Preview a timeline →</Link>
      </section>
      <EmptyState title="Weakness Detection">Reported topics will appear here when weakness analytics are available.</EmptyState>
      <EmptyState title="Recent Interview Activity">Interview history will be available once records can be saved.</EmptyState>
    </div>
  </>
}
