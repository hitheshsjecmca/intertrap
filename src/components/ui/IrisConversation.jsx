import { useEffect, useRef, useState } from 'react'
import { askIris } from '../../services/aiService.js'
import { LoadingSignal } from './HudVisuals.jsx'

const prompts = [
  'What patterns show up in my rejections?',
  'Which weaknesses should I practise first?',
  'How has my performance changed?',
  'Build a seven-day study plan from my results.',
]

export default function IrisConversation({ onAnswer }) {
  const [question, setQuestion] = useState('')
  const [consent, setConsent] = useState(false)
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(null)
  const active = useRef(null)

  useEffect(() => () => active.current?.abort(), [])

  async function send(event) {
    event.preventDefault()
    const input = question.trim()
    if (!input || !consent || active.current) return
    const controller = new AbortController()
    active.current = controller
    setError('')
    setPending(true)
    try {
      const result = await askIris(input, messages.at(-1)?.question, controller.signal)
      if (controller.signal.aborted) return
      setMessages((items) => [...items.slice(-19), { ...result, question: input, id: crypto.randomUUID() }])
      setRemaining(Number.isInteger(result.remaining) ? result.remaining : null)
      setQuestion('')
      onAnswer([result.answer, ...result.next_steps].join(' '))
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message)
    } finally {
      active.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return <div className="ai-panel iris-conversation">
    <h3>Ask I.R.I.S.</h3>
    <p className="ai-caption">Gemini can use up to 180 days of your recorded outcomes. Check AI guidance against your interview records.</p>
    <div className="iris-actions" role="group" aria-label="Suggested interview questions">
      {prompts.map((prompt) => <button type="button" className="ws-button ws-secondary" disabled={pending}
        key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}
    </div>
    {messages.length > 0 && <div role="log" aria-label="I.R.I.S. conversation" className="ai-transcript">
      {messages.map((message) => <article key={message.id}>
        <p><strong>You</strong> · {message.question}</p>
        <div className="iris-response"><strong>I.R.I.S. · {message.source === 'gemini' ? 'Gemini' : 'Workspace'}</strong>
          <p>{message.answer}</p>
          {message.next_steps.length > 0 && <ul>{message.next_steps.map((step, index) => <li key={index}>{step}</li>)}</ul>}
        </div>
      </article>)}
    </div>}
    <form className="ai-panel" onSubmit={send}>
      <label>Interview question <textarea rows={3} maxLength={600} value={question} disabled={pending}
        onChange={(event) => setQuestion(event.target.value)} /></label>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={pending}
        onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to send my question, the previous question if any, and relevant interview statistics to Gemini. Leave out names, passwords and confidential details.</span>
      </label>
      <div><button type="submit" className="ws-button" disabled={!consent || !question.trim() || pending}>
        {pending ? 'Sending…' : 'Send question'}
      </button></div>
    </form>
    {pending && <LoadingSignal>Preparing an evidence-based response…</LoadingSignal>}
    {error && <p className="ws-error" role="alert">{error}</p>}
    {remaining !== null && <p role="status">{remaining} AI chat {remaining === 1 ? 'request' : 'requests'} remaining today.</p>}
  </div>
}
