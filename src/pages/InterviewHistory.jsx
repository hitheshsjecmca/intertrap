import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AddInterviewLink, EmptyState, PageHeading, StatusBadge } from '../components/ui/WorkspaceUI.jsx'
import { RequestState } from '../components/ui/RequestState.jsx'
import { useRemoteData } from '../hooks/useRemoteData.js'
import { getInterviews } from '../services/interviewService.js'
import { MODES, OUTCOMES } from '../utils/interviewDraft.js'

const initial = { search: '', outcome: '', mode: '', from: '', to: '', sort: 'newest' }

export default function InterviewHistory() {
  const { state } = useLocation()
  const [input, setInput] = useState(initial)
  const [filters, setFilters] = useState(initial)
  const [page, setPage] = useState(1)
  const [issue, setIssue] = useState('')
  const load = useCallback((signal) => getInterviews(filters, page, signal), [filters, page])
  const request = useRemoteData(load)
  const { data } = request
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 12))

  function change(field, value) { setInput({ ...input, [field]: value }); setIssue('') }
  function apply(event) {
    event.preventDefault()
    if (input.from && input.to && input.from > input.to) {
      setIssue('The start date must be on or before the end date.')
      return
    }
    setFilters(input)
    setPage(1)
  }

  return <>
    <PageHeading title="Interview History" description="Search and review your recorded interviews." action={<AddInterviewLink />} />
    {state?.deleted && <p className="if-confirmation" role="status">Interview deleted.</p>}
    <form className="ws-card data-filters" onSubmit={apply}>
      <label>Company or role <input type="search" maxLength={120} value={input.search} onChange={(e) => change('search', e.target.value)} /></label>
      <label>Outcome <select value={input.outcome} onChange={(e) => change('outcome', e.target.value)}>
        <option value="">All outcomes</option>{OUTCOMES.map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Mode <select value={input.mode} onChange={(e) => change('mode', e.target.value)}>
        <option value="">All modes</option>{MODES.map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>From <input type="date" value={input.from} onChange={(e) => change('from', e.target.value)} /></label>
      <label>To <input type="date" value={input.to} onChange={(e) => change('to', e.target.value)} /></label>
      <label>Sort <select value={input.sort} onChange={(e) => change('sort', e.target.value)}>
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="company">Company name</option>
      </select></label>
      <div className="if-actions">
        <button className="ws-button" type="submit">Apply filters</button>
        <button className="ws-button ws-secondary" type="button" onClick={() => {
          setInput(initial); setFilters(initial); setPage(1); setIssue('')
        }}>Clear filters</button>
      </div>
      {issue && <p role="alert" className="ws-error">{issue}</p>}
    </form>
    <RequestState request={request} label="Loading interview history…" />
    {data && <>
      <p role="status">{data.total} {data.total === 1 ? 'interview' : 'interviews'} found</p>
      {data.rows.length === 0 && <EmptyState title="No interviews on this page">Add an interview or adjust your filters.</EmptyState>}
      <div className="ws-grid data-spaced">
        {data.rows.map((row) => <article className="ws-card history-card" key={row.id}>
          <h2><Link to={'/interviews/' + row.id}>{row.company_name}</Link></h2>
          <p>{row.job_role || 'Role not specified'}</p>
          <StatusBadge status={row.overall_status} />
          <dl className="if-counts">
            <div><dt>Interview date</dt><dd>{row.interview_date}</dd></div>
            <div><dt>Mode</dt><dd>{row.interview_mode || 'Not specified'}</dd></div>
            <div><dt>Configured rounds</dt><dd>{row.rounds}</dd></div>
            <div><dt>Cleared / rejected</dt><dd>{row.cleared} / {row.rejected}</dd></div>
            <div><dt>Weaknesses</dt><dd>{row.weaknesses}</dd></div>
            <div><dt>Last updated</dt><dd>{new Date(row.updated_at).toLocaleDateString()}</dd></div>
          </dl>
        </article>)}
      </div>
      {(pages > 1 || page > 1) && <nav aria-label="History pagination" className="if-actions data-spaced">
        <button type="button" className="ws-button ws-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
        <p>Page {page} of {pages}</p>
        <button type="button" className="ws-button ws-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next page</button>
      </nav>}
    </>}
  </>
}
