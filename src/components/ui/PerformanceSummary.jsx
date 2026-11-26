import { percent } from '../../utils/analyticsMetrics.js'

const metrics = [
  ['Total interviews', 'total_interviews'], ['Selected', 'selected'], ['Rejected', 'rejected'], ['Pending', 'pending'],
  ['Withdrawn', 'withdrawn'], ['Completed decisions', 'decisions'], ['Selection rate', 'selection_rate', 'Selected divided by selected plus rejected.'],
  ['Rejection rate', 'rejection_rate', 'Rejected divided by selected plus rejected.'],
  ['First-round rejections', 'first_rejected'], ['Known first-round outcomes', 'first_known'],
  ['First-round rejection rate', 'first_rejection_rate', 'Rejected first rounds divided by cleared and rejected first rounds.'],
  ['Configured rounds', 'configured'], ['Attempted rounds', 'attempted'], ['Cleared rounds', 'cleared_rounds'],
  ['Rejected rounds', 'rejected_rounds'], ['Pending rounds', 'pending_rounds'], ['Not reached', 'not_reached'],
  ['Round clearance', 'clearance_rate', 'Cleared rounds divided by cleared and rejected rounds.'],
  ['Recorded weaknesses', 'total_weaknesses'],
]

export default function PerformanceSummary({ summary, compact = false }) {
  return <dl className="ws-metrics performance-metrics" aria-label="Performance summary">
    {(compact ? metrics.slice(0, 4) : metrics).map(([label, key, formula]) => (
      <div className="ws-card ws-stat" key={key} data-tone={key}>
        <dt title={formula}>{label}</dt>
        <dd key={String(summary[key])} className={summary[key] == null ? undefined : 'data-value'}>
          {formula ? percent(summary[key]) : summary[key]}
        </dd>
        {formula && <dd className="data-formula">{formula}</dd>}
      </div>
    ))}
  </dl>
}
