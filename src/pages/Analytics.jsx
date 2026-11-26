import { useCallback, useState } from 'react'
import { PageHeading } from '../components/ui/WorkspaceUI.jsx'
import DateRangeFilter from '../components/ui/DateRangeFilter.jsx'
import PerformanceSummary from '../components/ui/PerformanceSummary.jsx'
import { RequestState } from '../components/ui/RequestState.jsx'
import ReadinessCore from '../components/charts/ReadinessCore.jsx'
import { InterviewOutcomeChart, PerformanceTrendChart, RoundPerformanceChart } from '../components/charts/PerformanceCharts.jsx'
import { useRemoteData } from '../hooks/useRemoteData.js'
import { getPerformance } from '../services/analyticsService.js'
import { percent, percentagePoints } from '../utils/analyticsMetrics.js'

export default function Analytics() {
  const [range, setRange] = useState({})
  const load = useCallback((signal) => getPerformance(range, signal), [range])
  const request = useRemoteData(load)
  const { data } = request
  return <>
    <PageHeading title="Performance Analytics" description="Review recorded outcomes, sample sizes and changes over time." />
    <DateRangeFilter onChange={setRange} />
    <RequestState request={request} label="Calculating your performance metrics…" />
    {data && <>
      <PerformanceSummary summary={data.summary} />
      <div className="ws-grid data-spaced">
        <ReadinessCore categories={data.categories} />
        <InterviewOutcomeChart summary={data.summary} />
        <PerformanceTrendChart data={data} />
        <PerformanceTrendChart data={data} kind="activity" />
        <RoundPerformanceChart categories={data.categories} />
        <section className="ws-card">
          <h2>First-Round Rejection Analysis</h2>
          <p>{data.summary.first_rejected} rejections · {data.summary.first_known} known first-round outcomes · {percent(data.summary.first_rejection_rate)}</p>
          <h3>Most rejected categories</h3>
          <ul>{data.categories.filter((c) => c.first_rejected > 0).sort((a, b) => b.first_rejected - a.first_rejected)
            .map((c) => <li key={c.id}>{c.name} · {c.first_rejected}</li>)}</ul>
          <h3>Reported weaknesses in rejected first rounds</h3>
          <ul>{data.weaknesses.filter((w) => w.first_rejected_occurrences > 0)
            .sort((a, b) => b.first_rejected_occurrences - a.first_rejected_occurrences).slice(0, 8)
            .map((w) => <li key={w.topic_key}>{w.topic} · {w.category} · {w.first_rejected_occurrences}</li>)}</ul>
        </section>
      </div>
      {data.comparison && <section className="ws-card data-spaced">
        <h2>Previous Equivalent Period</h2>
        <p>Changes compare the selected dates with the immediately preceding window of the same length.</p>
        <ul>{[['Selection', 'selection_rate'], ['Round clearance', 'clearance_rate']].map(([label, key]) => {
          const difference = percentagePoints(data.summary[key], data.comparison.summary[key])
          return <li key={key}>{label} · {difference == null ? 'Insufficient data' : `${difference > 0 ? '+' : ''}${difference.toFixed(1)} percentage points`}</li>
        })}</ul>
      </section>}
    </>}
  </>
}
