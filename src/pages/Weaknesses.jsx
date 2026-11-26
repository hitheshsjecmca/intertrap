import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeading } from '../components/ui/WorkspaceUI.jsx'
import { RequestState } from '../components/ui/RequestState.jsx'
import DateRangeFilter from '../components/ui/DateRangeFilter.jsx'
import { PerformanceTrendChart } from '../components/charts/PerformanceCharts.jsx'
import { useRemoteData } from '../hooks/useRemoteData.js'
import { getWeaknesses, getWeaknessEvidence } from '../services/analyticsService.js'
import { percent, priorityLabel, rate } from '../utils/analyticsMetrics.js'

export default function Weaknesses() {
  const [range, setRange] = useState({})
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('1')
  const [priority, setPriority] = useState('')
  const [type, setType] = useState('')
  const [order, setOrder] = useState('priority')
  const [expanded, setExpanded] = useState('')
  const load = useCallback((signal) => getWeaknesses(range, signal), [range])
  const request = useRemoteData(load)
  const { data } = request
  const rows = data?.weaknesses.filter((item) =>
    (!category || String(item.round_type_id) === category)
    && item.max_severity >= Number(severity)
    && (!priority || priorityLabel(item.priority) === priority)
    && (!type || (item.topic_id == null ? 'custom' : 'predefined') === type),
  ).sort((a, b) => order === 'last_reported' ? b.last_reported.localeCompare(a.last_reported) : b[order] - a[order]) ?? []
  const breakdown = new Map()
  for (const item of rows) breakdown.set(item.category, (breakdown.get(item.category) ?? 0) + item.occurrences)

  return <>
    <PageHeading title="Weakness Analysis" description="Find recurring topics and inspect the interview evidence behind each preparation priority." />
    <DateRangeFilter onChange={(next) => { setRange(next); setExpanded('') }} />
    <RequestState request={request} label="Loading weakness analysis…" />
    {data && <>
      <div className="ws-card data-filters">
        <label>Category <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>Minimum peak severity <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
        </select></label>
        <label>Priority <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>{['Low', 'Moderate', 'High', 'Critical'].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>Topic type <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All topics</option><option value="predefined">Predefined</option><option value="custom">Custom</option>
        </select></label>
        <label>Sort topics <select value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="priority">Preparation priority</option><option value="occurrences">Most reported</option>
          <option value="max_severity">Highest severity</option><option value="rejected_occurrences">Most reports in rejected rounds</option>
          <option value="last_reported">Most recent</option>
        </select></label>
      </div>
      <p>Priority weighs report frequency (60%) and average severity (40%). The score is a preparation heuristic.</p>
      {breakdown.size > 0 && <section className="ws-card data-spaced">
        <h2>Reports by Category</h2>
        <ul>{[...breakdown].map(([name, reports]) => <li key={name}>{name} · {reports} reports</li>)}</ul>
      </section>}
      <div className="ws-grid data-spaced">
        {rows.map((item) => <article className="ws-card weakness-card" key={item.topic_key}>
          <h2>{item.topic}</h2><p>{item.category} · {item.topic_id == null ? 'Custom' : 'Predefined'}</p>
          <p className="data-priority" data-priority={priorityLabel(item.priority)}>{priorityLabel(item.priority)} priority · {item.priority.toFixed(1)}/100</p>
          <p>{item.occurrences} reports across {item.interviews} interviews · {percent(rate(item.occurrences, item.sample_size))} of {item.sample_size} category attempts</p>
          <p>Average severity {item.average_severity.toFixed(1)}/5 · Peak {item.max_severity}/5 · Last reported {item.last_reported}</p>
          <p>{item.cleared_occurrences} in cleared rounds · {item.rejected_occurrences} in rejected rounds · {item.recent_occurrences} in the latest 30-day window</p>
          <button type="button" className="ws-button ws-secondary" aria-expanded={expanded === item.topic_key}
            onClick={() => setExpanded((key) => key === item.topic_key ? '' : item.topic_key)}>
            {expanded === item.topic_key ? 'Hide interviews' : 'View related interviews'}
          </button>
          {expanded === item.topic_key && <Evidence topic={item.topic_key} range={range} total={item.occurrences} />}
        </article>)}
      </div>
      {!rows.length && <p>No weakness topics match the current filters.</p>}
      <PerformanceTrendChart data={data} kind="weakness" />
    </>}
  </>
}

function Evidence({ topic, range, total }) {
  const [page, setPage] = useState(1)
  const load = useCallback((signal) => getWeaknessEvidence(topic, range, page, signal), [topic, range, page])
  const request = useRemoteData(load)
  return <>
    <RequestState request={request} label="Loading supporting interview records…" />
    {request.data && <>
      <ul>{request.data.map((row) => <li key={row.report_id}>
        <Link to={'/interviews/' + row.interview_id}>{row.company_name}</Link> · {row.interview_date} · Round {row.round_number} · {row.round_outcome} · severity {row.severity}/5
        {row.notes && <p>{row.notes}</p>}
      </li>)}</ul>
      {total > 15 && <div className="if-actions">
        <button type="button" className="ws-button ws-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button type="button" className="ws-button ws-secondary" disabled={page * 15 >= total} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </>}
  </>
}
