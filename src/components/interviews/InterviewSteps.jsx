import { useState } from 'react'
import { isAttempted, LIMITS, MODES, normalizeTopic, OUTCOMES, ROUND_STATUSES, SEVERITIES, topicsForRound, validateCustomTopic } from '../../utils/interviewDraft.js'

const format = (value) => value.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')

export function CompanyStep({ draft, change }) {
  const locked = draft.rounds.some((round) => round.status === 'rejected')
  return <div className="if-fields">
    <label>Company name <input required maxLength={LIMITS.company_name} value={draft.company_name}
      onChange={(event) => change('company_name', event.target.value)} /></label>
    <label>Job role <input maxLength={LIMITS.job_role} value={draft.job_role}
      onChange={(event) => change('job_role', event.target.value)} /></label>
    <label>Interview date <input required type="date" value={draft.interview_date}
      onChange={(event) => change('interview_date', event.target.value)} /></label>
    <label>Interview mode <select value={draft.interview_mode} onChange={(event) => change('interview_mode', event.target.value)}>
      <option value="">Not specified</option>
      {MODES.map((mode) => <option key={mode} value={mode}>{format(mode)}</option>)}
    </select></label>
    <label>Overall outcome <select value={draft.overall_status} disabled={locked}
      onChange={(event) => change('overall_status', event.target.value)}>
      {OUTCOMES.map((outcome) => <option key={outcome} value={outcome}
        disabled={outcome === 'selected' && draft.rounds.some((round) => round.status !== 'cleared')}>{format(outcome)}</option>)}
    </select>{locked && <small>A rejected round sets the interview outcome to rejected.</small>}</label>
    <label className="if-wide">Interview notes <textarea rows="3" maxLength={LIMITS.notes} value={draft.notes}
      onChange={(event) => change('notes', event.target.value)} /></label>
  </div>
}

export function RoundsStep({ rounds, categories, update, add, remove, move }) {
  return <div className="if-stack">
    {rounds.length === 0 && <p>Add rounds as needed. An interview can be previewed without rounds.</p>}
    {rounds.map((round, index) => (
      <fieldset className="if-panel" key={round.key} data-round-status={round.status}>
        <legend>Round {round.round_number}</legend>
        <div className="if-fields">
          <label>Round category <select required value={round.round_type_id}
            onChange={(event) => update(round.key, 'round_type_id', event.target.value)}>
            <option value="">Choose a category</option>
            {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>Custom round name <input maxLength={LIMITS.custom_name} value={round.custom_name}
            onChange={(event) => update(round.key, 'custom_name', event.target.value)} /></label>
          <label>Round date <input type="date" value={round.round_date}
            onChange={(event) => update(round.key, 'round_date', event.target.value)} /></label>
          <label>Round status <select value={round.status} disabled={round.status === 'not_reached' || rounds[index - 1]?.status === 'pending'}
            onChange={(event) => update(round.key, 'status', event.target.value)}>
            {ROUND_STATUSES.map((status) => (
              <option key={status} value={status} disabled={status === 'not_reached'}>{format(status)}</option>
            ))}
          </select>{round.status === 'not_reached' && <small>An earlier round was rejected.</small>}
          {round.status !== 'not_reached' && rounds[index - 1]?.status === 'pending' && <small>Record the previous round’s outcome first.</small>}</label>
          <label className="if-wide">Round notes <textarea rows="2" maxLength={LIMITS.notes} value={round.notes}
            onChange={(event) => update(round.key, 'notes', event.target.value)} /></label>
        </div>
        <div className="if-actions">
          <button type="button" className="ws-button ws-secondary" disabled={index === 0}
            aria-label={`Move round ${round.round_number} up`} onClick={() => move(index, -1)}>Move up</button>
          <button type="button" className="ws-button ws-secondary" disabled={index === rounds.length - 1}
            aria-label={`Move round ${round.round_number} down`} onClick={() => move(index, 1)}>Move down</button>
          <button type="button" className="ws-button ws-secondary"
            aria-label={`Remove round ${round.round_number}`} onClick={() => remove(round.key)}>Remove</button>
        </div>
      </fieldset>
    ))}
    <div><button type="button" className="ws-button ws-secondary" onClick={add}>+ Add round</button></div>
  </div>
}

export function WeaknessStep({ rounds, catalog, update }) {
  const attempted = rounds.filter(isAttempted)
  if (!attempted.length) return <p>Weaknesses can be recorded for cleared or rejected rounds. You can continue without selecting any.</p>

  return <div className="if-stack">{attempted.map((round) => (
    <RoundTopics key={round.key} round={round} topics={topicsForRound(catalog.topics, round.round_type_id)}
      category={catalog.categories.find(({ id }) => String(id) === String(round.round_type_id))?.name}
      update={(weaknesses) => update(round.key, 'weaknesses', weaknesses)} />
  ))}</div>
}

function RoundTopics({ round, topics, category, update }) {
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const { weaknesses } = round

  function add(weakness) {
    update([...weaknesses, { ...weakness, key: crypto.randomUUID(), severity: 3, notes: '' }])
  }

  function addCustom() {
    const message = validateCustomTopic(custom, weaknesses)
    setError(message)
    if (message) return
    add({ topic_id: null, custom_topic: normalizeTopic(custom) })
    setCustom('')
  }

  function remove(key) {
    update(weaknesses.filter((weakness) => weakness.key !== key))
  }

  function edit(key, field, value) {
    update(weaknesses.map((weakness) => weakness.key === key ? { ...weakness, [field]: value } : weakness))
  }

  return <fieldset className="if-panel">
    <legend>Round {round.round_number} · {round.custom_name || category}</legend>
    <p>Select any topics you struggled with, or leave this round blank.</p>
    <div className="if-chips">
      {topics.map((topic) => {
        const selected = weaknesses.find((weakness) => weakness.topic_id === topic.id)
        return <label className="if-chip" key={topic.id}>
          <input type="checkbox" checked={Boolean(selected)} onChange={() => {
            if (selected) remove(selected.key)
            else add({ topic_id: topic.id, custom_topic: null })
          }} />
          {topic.name}
        </label>
      })}
    </div>
    <div className="if-custom">
      <label>Custom topic <input value={custom} maxLength={LIMITS.custom_topic}
        onChange={(event) => { setCustom(event.target.value); setError('') }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }} /></label>
      <button type="button" className="ws-button ws-secondary" onClick={addCustom}>Add topic</button>
    </div>
    {error && <p className="ws-error" role="alert">{error}</p>}
    {weaknesses.length > 0 && <ul className="if-selected">
      {weaknesses.map((weakness) => {
        const name = weakness.custom_topic ?? topics.find(({ id }) => id === weakness.topic_id)?.name
        return <li key={weakness.key} className="if-fields">
          <strong>{name}</strong>
          <label>Severity <select value={weakness.severity}
            onChange={(event) => edit(weakness.key, 'severity', Number(event.target.value))}>
            {SEVERITIES.map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}
          </select><span className="if-severity" data-severity={weakness.severity} aria-hidden="true">
            {SEVERITIES.map((label, index) => <span key={label} data-filled={index < weakness.severity} />)}
          </span></label>
          <label>Weakness notes <textarea rows="2" maxLength={LIMITS.notes} value={weakness.notes}
            onChange={(event) => edit(weakness.key, 'notes', event.target.value)} /></label>
          <button type="button" className="ws-button ws-secondary" aria-label={`Remove topic ${name}`}
            onClick={() => remove(weakness.key)}>Remove topic</button>
        </li>
      })}
    </ul>}
  </fieldset>
}
