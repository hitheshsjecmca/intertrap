import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import InterviewForm from '../components/interviews/InterviewForm.jsx'
import InterviewReview from '../components/interviews/InterviewReview.jsx'
import InterviewAiAnalysis from '../components/interviews/InterviewAiAnalysis.jsx'
import { EmptyState, PageHeading } from '../components/ui/WorkspaceUI.jsx'
import { RequestState } from '../components/ui/RequestState.jsx'
import { useRemoteData } from '../hooks/useRemoteData.js'
import { deleteInterview, getInterviewById, interviewCatalog, interviewToDraft } from '../services/interviewService.js'

export default function InterviewRecord({ edit = false }) {
  const { id } = useParams()
  const { user } = useOutletContext()
  const load = useCallback((signal) => getInterviewById(id, signal), [id])
  const request = useRemoteData(load)
  if (request.loading || request.error) return <RequestState request={request} label="Loading interview details…" />
  if (!request.data) return <EmptyState title="Interview unavailable"><Link to="/interviews">Return to history</Link></EmptyState>
  if (edit) return <>
    <PageHeading title="Edit Interview" description={request.data.company_name} />
    <InterviewForm key={user.id + ':' + id} record={request.data} initial={interviewToDraft(request.data)} />
  </>
  return <InterviewDetails record={request.data} />
}

function InterviewDetails({ record }) {
  const { state } = useLocation()
  const navigate = useNavigate()
  const dialog = useRef(null)
  const busy = useRef(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (busy.current) return
    busy.current = true
    setDeleting(true)
    setError('')
    try {
      await deleteInterview(record.id)
      dialog.current?.close()
      await navigate('/interviews', { replace: true, state: { deleted: true } })
    } catch (failure) {
      setError(failure.message)
    } finally {
      busy.current = false
      setDeleting(false)
    }
  }

  return <>
    <PageHeading title={record.company_name} description={record.job_role || 'Interview record'} action={
      <div className="if-actions">
        <Link className="ws-button" to={'/interviews/' + record.id + '/edit'}>Edit Interview</Link>
        <Link className="ws-button ws-secondary" to="/interviews">Return to History</Link>
      </div>
    } />
    {state?.saved && <p className="if-confirmation" role="status">I.R.I.S. · {state.saved === 'created'
      ? 'Interview recorded successfully. Your performance profile has been updated.'
      : 'Interview updated successfully.'}</p>}
    <div className="ws-card if-stack">
      <InterviewReview draft={interviewToDraft(record)} catalog={interviewCatalog(record)} expandable />
      <dl className="if-counts">
        <div><dt>Created</dt><dd>{new Date(record.created_at).toLocaleString()}</dd></div>
        <div><dt>Last updated</dt><dd>{new Date(record.updated_at).toLocaleString()}</dd></div>
      </dl>
      <div><button className="ws-button ws-secondary data-danger" type="button"
        onClick={() => { setError(''); dialog.current.showModal() }}>Delete Interview</button></div>
    </div>
    <div className="data-spaced"><InterviewAiAnalysis record={record} /></div>
    <dialog className="ws-card data-dialog" ref={dialog} aria-labelledby="delete-title"
      onCancel={(event) => { if (busy.current) event.preventDefault() }}>
      <h2 id="delete-title">Delete this interview?</h2>
      <p>This permanently removes the interview, its rounds, weaknesses and any associated AI analyses.</p>
      {error && <p role="alert" className="ws-error">{error}</p>}
      <div className="if-actions">
        <button type="button" autoFocus className="ws-button ws-secondary" disabled={deleting} onClick={() => dialog.current.close()}>Cancel</button>
        <button type="button" className="ws-button data-danger" disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Confirm deletion'}</button>
      </div>
    </dialog>
  </>
}
