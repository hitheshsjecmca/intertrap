import { StatusBadge } from '../ui/WorkspaceUI.jsx'
import { ProgressDial } from '../ui/HudVisuals.jsx'
import { calculateMetrics, SEVERITIES } from '../../utils/interviewDraft.js'

export default function InterviewReview({ draft, catalog }) {
  const metrics = calculateMetrics(draft.rounds)
  const counts = [
    ['Configured', metrics.total], ['Attempted', metrics.attempted],
    ['Cleared', metrics.cleared], ['Rejected', metrics.rejected],
    ['Pending', metrics.pending], ['Not reached', metrics.not_reached],
    ['Weaknesses', metrics.weaknesses],
    ['Round clearance', metrics.clearanceRate === null ? 'Insufficient data' : `${metrics.clearanceRate.toFixed(1)}%`],
  ]
  return <div className="if-stack">
    <section className="if-panel">
      <h3>{draft.company_name}</h3>
      <dl className="if-counts">
        <div><dt>Job role</dt><dd>{draft.job_role || 'Not specified'}</dd></div>
        <div><dt>Date</dt><dd>{draft.interview_date}</dd></div>
        <div><dt>Mode</dt><dd>{draft.interview_mode || 'Not specified'}</dd></div>
        <div><dt>Outcome</dt><dd><StatusBadge status={draft.overall_status} /></dd></div>
      </dl>
      {draft.notes && <p className="if-notes">{draft.notes}</p>}
    </section>
    <section className="if-panel">
      <h3>Round summary</h3>
      <dl className="if-counts">
        {counts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {metrics.clearanceRate !== null && <div aria-hidden="true" className="if-dial">
        <ProgressDial value={metrics.clearanceRate} />
      </div>}
      <p>Clearance uses rounds marked cleared or rejected. It describes this interview’s outcomes.</p>
    </section>
    <section className="if-panel">
      <h3>Interview timeline</h3>
      {draft.rounds.length === 0 && <p>No rounds configured.</p>}
      <ol className="if-timeline">
        {draft.rounds.map((round) => {
          const category = catalog.categories.find(({ id }) => String(id) === String(round.round_type_id))?.name
          return <li key={round.key} data-round-status={round.status}>
            <h4>Round {round.round_number} · {round.custom_name || category}</h4>
            <StatusBadge status={round.status} />
            {round.custom_name && <p>Category {category}</p>}
            {round.round_date && <p>{round.round_date}</p>}
            {round.notes && <p className="if-notes">{round.notes}</p>}
            {round.weaknesses.length > 0 && <ul>{round.weaknesses.map((weakness) => (
              <li key={weakness.key}>
                <strong>{weakness.custom_topic ?? catalog.topics.find(({ id }) => id === weakness.topic_id)?.name}</strong>
                <p>Severity {weakness.severity} · {SEVERITIES[weakness.severity - 1]}</p>
                {weakness.notes && <p className="if-notes">{weakness.notes}</p>}
              </li>
            ))}</ul>}
          </li>
        })}
      </ol>
    </section>
  </div>
}
