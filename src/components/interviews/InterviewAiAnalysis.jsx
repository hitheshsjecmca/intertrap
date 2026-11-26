import { useCallback, useEffect, useRef, useState } from 'react'
import { useRemoteData } from '../../hooks/useRemoteData.js'
import { analyzeInterview, getSavedAnalyses } from '../../services/aiService.js'
import { RequestState } from '../ui/RequestState.jsx'
import { LoadingSignal } from '../ui/HudVisuals.jsx'

export default function InterviewAiAnalysis({ record }) {
  const load = useCallback((signal) => getSavedAnalyses(record.id, signal), [record.id])
  const request = useRemoteData(load)
  const [consent, setConsent] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [generated, setGenerated] = useState(null)
  const active = useRef(null)

  useEffect(() => () => active.current?.abort(), [])

  const reports = request.data ?? []
  const history = generated ? [generated, ...reports.filter(({ id }) => id !== generated.id)] : reports
  const current = history.find((report) => report.interview_version === record.version && report.prompt_version === 'iris-v1')
  const report = history.find(({ id }) => id === selected) ?? current ?? history[0]
  const stale = report && report.interview_version !== record.version

  async function generate() {
    if (!consent || active.current || current) return
    const controller = new AbortController()
    active.current = controller
    setGenerating(true)
    setError('')
    setNotice('')
    try {
      const result = await analyzeInterview(record.id, controller.signal)
      if (controller.signal.aborted) return
      setGenerated({ ...result.analysis, prompt_version: 'iris-v1' })
      setSelected(result.analysis.id)
      setNotice(result.cached ? 'Loaded the current saved analysis.' : 'AI analysis saved.')
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message)
    } finally {
      active.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }

  return <section className="ws-card ai-panel" aria-labelledby="interview-ai-title">
    <h2 id="interview-ai-title">I.R.I.S. Interview Analysis</h2>
    <RequestState request={request} label="Loading saved analyses…" />
    {!request.loading && !request.error && !report && <p>No saved analysis for this interview.</p>}
    {report && <>
      {history.length > 1 && <label>Recent saved reports
        <select value={report.id} onChange={(event) => setSelected(event.target.value)}>
          {history.map((item) => <option value={item.id} key={item.id}>
            {new Date(item.created_at).toLocaleString()} · {item.interview_version ? `version ${item.interview_version}` : 'unknown version'}
          </option>)}
        </select>
      </label>}
      {stale && <p className="ai-stale" role="status">This report is out of date. It describes an older or unknown interview version.</p>}
      <p>{report.summary}</p>
      <div className="ws-grid">
        <Advice title="Observed strengths" values={report.strengths} />
        <Advice title="Reported weaknesses" values={report.weaknesses} />
        <Advice title="Preparation priorities" values={report.recommendations} />
        <Advice title="Technical topics" values={report.guidance?.technical} />
        <Advice title="Coding practice" values={report.guidance?.coding} />
        <Advice title="Communication practice" values={report.guidance?.communication} />
      </div>
      {report.guidance?.feedback && <p><strong>Performance feedback</strong> · {report.guidance.feedback}</p>}
      {Array.isArray(report.roadmap) && report.roadmap.length > 0 && <details>
        <summary>Seven-day preparation roadmap</summary>
        <ol>{report.roadmap.map(({ day, focus, task }) => <li key={day}><strong>{focus}</strong> · {task}</li>)}</ol>
      </details>}
      <p className="ai-caption">AI-generated coaching can contain errors. Check it against your recorded outcomes.</p>
    </>}
    {current ? <p>Current interview version already analysed.</p> : <>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={generating}
        onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to send round outcomes, weakness categories or predefined topics, and recent performance statistics to Gemini. Interview notes and identifying fields stay in InterTrap.</span>
      </label>
      <div><button className="ws-button" type="button" disabled={!consent || generating || request.loading || Boolean(request.error)}
        onClick={generate}>{generating ? 'Generating analysis…' : 'Generate AI Analysis'}</button></div>
    </>}
    {generating && <LoadingSignal>Evaluating the interview evidence…</LoadingSignal>}
    {notice && <p className="if-confirmation" role="status">{notice}</p>}
    {error && <div className="ai-panel">
      <p className="ws-error" role="alert">{error}</p>
      <div><button type="button" className="ws-button ws-secondary" onClick={request.retry}>Refresh saved reports</button></div>
    </div>}
  </section>
}

function Advice({ title, values }) {
  const items = Array.isArray(values) ? values.filter((item) => typeof item === 'string') : []
  if (!items.length) return null
  return <section><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
}
