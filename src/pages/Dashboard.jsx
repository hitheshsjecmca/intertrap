import { useCallback } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AddInterviewLink, EmptyState, PageHeading, StatusBadge } from '../components/ui/WorkspaceUI.jsx'
import { RequestState } from '../components/ui/RequestState.jsx'
import IrisAssistant from '../components/ui/IrisAssistant.jsx'
import PerformanceSummary from '../components/ui/PerformanceSummary.jsx'
import ReadinessCore from '../components/charts/ReadinessCore.jsx'
import { PerformanceTrendChart, RoundPerformanceChart } from '../components/charts/PerformanceCharts.jsx'
import { useRemoteData } from '../hooks/useRemoteData.js'
import { getDashboard } from '../services/analyticsService.js'
import { dashboardMessage } from '../utils/irisResponses.js'
import { percent, priorityLabel } from '../utils/analyticsMetrics.js'

export default function Dashboard() {
  const { displayName } = useOutletContext()
  const load = useCallback((signal) => getDashboard(signal), [])
  const request = useRemoteData(load)
  const { data } = request

  return <>
    <PageHeading title="Career Command Center" description={`Welcome, ${displayName}.`} action={<AddInterviewLink />} />
    <RequestState request={request} label="Synchronizing interview telemetry…" />
    {data && <PerformanceSummary summary={data.summary} compact />}
    <div className="hud-overview">
      {data && <>
        <ReadinessCore categories={data.categories} />
        <RoundPerformanceChart categories={data.categories} radar />
      </>}
      <IrisAssistant contextMessage={dashboardMessage(data)} />
    </div>
    {data && <>
      {!data.summary.total_interviews && <EmptyState title="Your first interview starts here">Record a company, its rounds and any topics you want to practise.</EmptyState>}
      <div className="ws-grid data-spaced">
        <PerformanceTrendChart data={data} />
        <section className="ws-card">
          <h2>Preparation Priorities</h2>
          {data.weaknesses.length ? <ul>{data.weaknesses.slice(0, 4).map((item) => (
            <li key={item.topic_key}><strong>{item.topic}</strong> · {item.category} · {priorityLabel(item.priority)} priority · {item.interviews} interviews</li>
          ))}</ul> : <p>No weaknesses reported in attempted rounds.</p>}
          <Link to="/weaknesses">Explore weaknesses →</Link>
        </section>
        <section className="ws-card">
          <h2>Recent Interview Activity</h2>
          {data.recent.length ? <ul className="data-recent">{data.recent.map((record) => <li key={record.id}>
            <Link to={'/interviews/' + record.id}>{record.company_name}</Link> <StatusBadge status={record.overall_status} />
            <p>{record.interview_date} · {record.rounds} configured rounds</p>
          </li>)}</ul> : <p>Saved interviews will appear here.</p>}
          <Link to="/interviews">Open interview history →</Link>
        </section>
        <section className="ws-card">
          <h2>Selection and First-Round Outcomes</h2>
          <p>Selection rate {percent(data.summary.selection_rate)} · {data.summary.decisions} decisions</p>
          <p>First-round rejections {data.summary.first_rejected} · {percent(data.summary.first_rejection_rate)} of {data.summary.first_known} known first-round outcomes</p>
          <Link to="/analytics">Open performance analytics →</Link>
        </section>
      </div>
    </>}
  </>
}
