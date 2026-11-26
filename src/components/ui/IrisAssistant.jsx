import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IntelligenceCore } from './HudVisuals.jsx'
import IrisConversation from './IrisConversation.jsx'

const welcome = 'Welcome back. I can help you record interviews and interpret your workspace reports.'
const guidance = [
  ['Record an interview', 'Open Add Interview, enter the company details, and configure your rounds. Review the draft before saving it.'],
  ['Record weaknesses', 'In the interview form, mark a round cleared or rejected to select weakness topics. You can add a custom topic and rate its severity.'],
  ['Readiness status', 'Open Performance Analytics to see readiness, assessment coverage and the sample behind the estimate.'],
]

export default function IrisAssistant({ initiallyOpen = false, contextMessage = welcome, chatEnabled = false }) {
  const panelId = useId()
  const [open, setOpen] = useState(initiallyOpen)
  const [answer, setResponse] = useState(null)
  const [chatAnswer, setChatAnswer] = useState('')
  const response = answer ?? contextMessage
  const [voice, setVoice] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const utterance = useRef(null)
  const speech = typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window
    ? window.speechSynthesis : undefined

  useEffect(() => () => {
    if (!utterance.current) return
    utterance.current = null
    speech?.cancel()
  }, [speech])

  function stop() {
    const active = utterance.current
    utterance.current = null
    if (active) speech?.cancel()
    setSpeaking(false)
  }

  function toggleVoice() {
    if (voice) stop()
    setVoice(!voice)
    setSpeechError('')
  }

  function speak() {
    if (!voice || !speech) return
    stop()
    setSpeechError('')
    const message = new window.SpeechSynthesisUtterance(chatAnswer || response)
    message.lang = 'en'
    message.rate = 0.95
    function finish(failed) {
      if (utterance.current !== message) return
      utterance.current = null
      setSpeaking(false)
      if (failed) setSpeechError('Voice playback failed. Try again or read the response below.')
    }
    message.onend = () => finish(false)
    message.onerror = () => finish(true)
    utterance.current = message
    setSpeaking(true)
    try {
      speech.speak(message)
    } catch {
      finish(true)
    }
  }

  function togglePanel() {
    if (open) stop()
    setOpen(!open)
  }

  return <section className="ws-card iris-panel" aria-label="I.R.I.S. assistant">
    <div className="iris-summary">
      <IntelligenceCore compact />
      <div>
        <h2>I.R.I.S.</h2>
        <p>Interview Readiness Intelligence System</p>
        <p className="iris-status"><span aria-hidden="true" /> {chatEnabled ? 'Interview coaching' : 'Workspace guidance'}</p>
      </div>
    </div>
    <button type="button" className="ws-button ws-secondary" aria-expanded={open}
      aria-controls={panelId} onClick={togglePanel}>{open ? 'Close assistant' : 'Open assistant'}</button>
    <div id={panelId} hidden={!open} className="iris-console">
      <p className="iris-response" aria-live="polite" aria-atomic="true">{response}</p>
      <div className="iris-actions" role="group" aria-label="Suggested questions">
        {guidance.map(([label, answer]) => <button className="ws-button ws-secondary" type="button" key={label}
          onClick={() => { stop(); setSpeechError(''); setResponse(answer) }}>{label}</button>)}
      </div>
      <Link to="/interviews/new">Record an interview →</Link>
      <Link to="/analytics">Open performance analytics →</Link>
      {chatEnabled && <IrisConversation onAnswer={(message) => { stop(); setChatAnswer(message) }} />}
      {speech ? <div className="iris-actions">
        <button type="button" className="ws-button ws-secondary" aria-pressed={voice}
          onClick={toggleVoice}>{voice ? 'Mute voice' : 'Enable voice'}</button>
        <button type="button" className="ws-button ws-secondary" disabled={!voice || speaking}
          onClick={speak}>Read response</button>
        {speaking && <button type="button" className="ws-button ws-secondary" onClick={stop}>Stop voice</button>}
      </div> : <p>Voice playback is unavailable in this browser.</p>}
      {speechError && <p role="status">{speechError}</p>}
    </div>
  </section>
}
