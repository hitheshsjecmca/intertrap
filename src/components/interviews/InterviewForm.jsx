import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { fetchCatalog } from '../../services/catalogService.js'
import { LoadingSignal } from '../ui/HudVisuals.jsx'
import { isAttempted, moveRound, preparePayload, reviseRounds, validateCompany, validateRounds, validateWeaknesses } from '../../utils/interviewDraft.js'
import { CompanyStep, RoundsStep, WeaknessStep } from './InterviewSteps.jsx'
import InterviewReview from './InterviewReview.jsx'
import '../../styles/interview-form.css'

const steps = ['Company details', 'Interview rounds', 'Weakness identification', 'Review and preview']

function initialDraft() {
  const today = new Date()
  const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, '0')).join('-')
  return {
    company_name: '', job_role: '', interview_date: date, interview_mode: '',
    overall_status: 'pending', notes: '', rounds: [],
  }
}

function newRound() {
  return { key: crypto.randomUUID(), round_type_id: '', custom_name: '', round_date: '', status: 'pending', notes: '', weaknesses: [] }
}

export default function InterviewForm() {
  const [draft, setDraft] = useState(initialDraft)
  const [step, setStep] = useState(0)
  const [issue, setIssue] = useState('')
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const heading = useRef(null)
  const navigate = useNavigate()
  const blocker = useBlocker(dirty)

  useEffect(() => {
    const controller = new AbortController()
    fetchCatalog(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setCatalog(data) },
      (error) => { if (!controller.signal.aborted) setCatalogError(error.message) },
    )
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    if (!dirty) return
    function warn(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function setValue(next) {
    setDraft(next)
    setDirty(true)
    setIssue('')
    setPreview(null)
  }

  function commitRounds(rounds) {
    const next = reviseRounds(draft, rounds)
    const byKey = new Map(next.rounds.map((round) => [round.key, round]))
    const losesData = draft.rounds.some((before) => {
      const after = byKey.get(before.key)
      return (isAttempted(before) && (!after || !isAttempted(after)))
        || (before.weaknesses.length > 0 && (!after || !after.weaknesses.length))
    })
    if (losesData && !window.confirm('This change will discard a recorded round outcome or selected weaknesses. Continue?')) return
    setValue(next)
  }

  function updateRound(key, field, value) {
    if (field === 'weaknesses') {
      setValue({ ...draft, rounds: draft.rounds.map((round) => round.key === key ? { ...round, weaknesses: value } : round) })
      return
    }
    const rounds = draft.rounds.map((round) => {
      if (round.key !== key) return round
      const next = { ...round, [field]: value }
      if (field === 'round_type_id' && round.round_type_id !== value) next.weaknesses = []
      return next
    })
    commitRounds(rounds)
  }

  function goTo(index) {
    setIssue('')
    setStep(index)
    heading.current?.focus()
  }

  function advance(event) {
    event.preventDefault()
    if (step > 0 && !catalog) return
    const errors = [
      () => validateCompany(draft),
      () => validateRounds(draft.rounds, catalog.categories),
      () => validateWeaknesses(draft.rounds, catalog.topics),
    ]
    if (step < 3) {
      const error = errors[step]()
      if (error) setIssue(error)
      else goTo(step + 1)
      return
    }
    const { payload, error } = preparePayload(draft, catalog)
    if (error) setIssue(error)
    else setPreview(payload)
  }

  return <>
    {blocker.state === 'blocked' && <section className="ws-card if-leave" aria-label="Unsaved interview">
      <h2>Discard this interview draft?</h2>
      <p>Your changes will be lost when you leave this page.</p>
      <div className="if-actions">
        <button type="button" autoFocus className="ws-button ws-secondary" onClick={blocker.reset}>Keep editing</button>
        <button type="button" className="ws-button" onClick={blocker.proceed}>Discard and leave</button>
      </div>
    </section>}
    <form className="ws-card if-form" noValidate onSubmit={advance}>
      <ol className="if-stepper" aria-label="Interview form progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={index < step}>
            <span>{index + 1}</span>{label}
          </li>
        ))}
      </ol>
      <h2 tabIndex={-1} ref={heading}>{steps[step]}</h2>
      <div className="if-stage if-stack" key={step}>
      {step === 0 && <CompanyStep draft={draft} change={(field, value) => setValue({ ...draft, [field]: value })} />}
      {step > 0 && !catalog && (
        catalogError ? <div className="if-stack">
          <p role="alert" className="ws-error">{catalogError}</p>
          <div><button type="button" className="ws-button ws-secondary" onClick={() => {
            setCatalogError('')
            setAttempt((value) => value + 1)
          }}>Retry catalog</button></div>
        </div> : <LoadingSignal>Loading round categories and topics…</LoadingSignal>
      )}
      {step === 1 && catalog && <RoundsStep rounds={draft.rounds} categories={catalog.categories} update={updateRound}
        add={() => commitRounds([...draft.rounds, newRound()])}
        remove={(key) => commitRounds(draft.rounds.filter((round) => round.key !== key))}
        move={(index, offset) => commitRounds(moveRound(draft.rounds, index, offset))} />}
      {step === 2 && catalog && <WeaknessStep rounds={draft.rounds} catalog={catalog} update={updateRound} />}
      {step === 3 && catalog && <InterviewReview draft={draft} catalog={catalog} />}
      </div>
      {issue && <p role="alert" className="ws-error">{issue}</p>}
      {preview && <p className="if-confirmation" role="status">Preview complete for {preview.company_name}. This draft is available only on this page.</p>}
      <div className="if-footer">
        <button type="button" className="ws-button ws-secondary" onClick={() => navigate('/dashboard')}>Cancel</button>
        <div className="if-actions">
          {step > 0 && <button type="button" className="ws-button ws-secondary" onClick={() => goTo(step - 1)}>Previous</button>}
          <button type="submit" className="ws-button" disabled={step > 0 && !catalog}>
            {step === 3 ? 'Complete Preview' : 'Next'}
          </button>
        </div>
      </div>
    </form>
  </>
}
