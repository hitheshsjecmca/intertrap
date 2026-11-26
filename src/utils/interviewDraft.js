export const MODES = ['online', 'offline', 'hybrid']
export const OUTCOMES = ['pending', 'selected', 'rejected', 'withdrawn']
export const ROUND_STATUSES = ['pending', 'cleared', 'rejected', 'not_reached']
export const SEVERITIES = ['Minor difficulty', 'Some difficulty', 'Moderate difficulty', 'Major difficulty', 'Unable to answer']
export const LIMITS = { company_name: 120, job_role: 120, custom_name: 120, custom_topic: 120, notes: 2000 }

export function isAttempted(round) {
  return round.status === 'cleared' || round.status === 'rejected'
}

export function applyProgression(rounds) {
  let rejected = false
  return rounds.map((round, index) => {
    const status = rejected ? 'not_reached' : round.status === 'not_reached' ? 'pending' : round.status
    if (status === 'rejected') rejected = true
    return {
      ...round,
      round_number: index + 1,
      status,
      weaknesses: isAttempted({ status }) ? round.weaknesses : [],
    }
  })
}

export function reviseRounds(draft, rounds) {
  const next = applyProgression(rounds)
  const rejected = next.some((round) => round.status === 'rejected')
  const previouslyRejected = draft.rounds.some((round) => round.status === 'rejected')
  return { ...draft, rounds: next, overall_status: rejected ? 'rejected' : previouslyRejected ? 'pending' : draft.overall_status }
}

export function moveRound(rounds, index, offset) {
  const target = index + offset
  if (index < 0 || index >= rounds.length || target < 0 || target >= rounds.length) return rounds
  const next = [...rounds]
  const [round] = next.splice(index, 1)
  next.splice(target, 0, round)
  return next
}

export function normalizeTopic(value) {
  return value.trim().replace(/\s+/g, ' ')
}

export function topicsForRound(topics, categoryId) {
  return topics.filter((topic) => String(topic.round_type_id) === String(categoryId))
}

export function validateCustomTopic(value, weaknesses) {
  const name = normalizeTopic(value)
  if (!name) return 'Enter a custom topic.'
  if (name.length > LIMITS.custom_topic) return 'Custom topics must be at most 120 characters.'
  if (weaknesses.some((weakness) => weakness.custom_topic?.toLowerCase() === name.toLowerCase())) {
    return 'This custom topic is already selected.'
  }
  return ''
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function validateCompany(draft) {
  if (!draft.company_name.trim()) return 'Enter a company name.'
  if (draft.company_name.trim().length > LIMITS.company_name) return 'Company names must be at most 120 characters.'
  if (draft.job_role.trim().length > LIMITS.job_role) return 'Job roles must be at most 120 characters.'
  if (!validDate(draft.interview_date)) return 'Enter a valid interview date.'
  if (draft.interview_mode && !MODES.includes(draft.interview_mode)) return 'Choose a valid interview mode.'
  if (!OUTCOMES.includes(draft.overall_status)) return 'Choose a valid overall outcome.'
  if (draft.notes.length > LIMITS.notes) return 'Company notes must be at most 2,000 characters.'
  return ''
}

export function validateRounds(rounds, categories) {
  for (const [index, round] of rounds.entries()) {
    const label = `Round ${index + 1}`
    if (!categories.some(({ id }) => String(id) === String(round.round_type_id))) return `${label} requires a category.`
    if (!ROUND_STATUSES.includes(round.status)) return `${label} requires a valid status.`
    if (round.round_date && !validDate(round.round_date)) return `${label} requires a valid date.`
    if (round.custom_name.length > LIMITS.custom_name || round.notes.length > LIMITS.notes) return `${label} exceeds the name or notes limit.`
  }
  const normalized = applyProgression(rounds)
  if (rounds.some((round, index) => round.status !== normalized[index].status || round.round_number !== index + 1)) {
    return 'Review round order and outcomes.'
  }
  return ''
}

export function validateWeaknesses(rounds, topics) {
  for (const round of rounds) {
    const label = `Round ${round.round_number}`
    if (round.weaknesses.length && !isAttempted(round)) return `${label} must be attempted before adding weaknesses.`
    const selected = new Set()
    const allowed = new Set(topicsForRound(topics, round.round_type_id).map(({ id }) => String(id)))
    const custom = new Set()
    for (const weakness of round.weaknesses) {
      if (!Number.isInteger(weakness.severity) || weakness.severity < 1 || weakness.severity > 5) {
        return `${label} requires severity from 1 to 5.`
      }
      if (weakness.notes.length > LIMITS.notes) return `${label} exceeds the weakness notes limit.`
      if (weakness.topic_id != null) {
        const key = String(weakness.topic_id)
        if (weakness.custom_topic != null || !allowed.has(key) || selected.has(key)) return `${label} has an invalid or duplicate predefined topic.`
        selected.add(key)
      } else {
        const name = normalizeTopic(weakness.custom_topic ?? '')
        const key = name.toLowerCase()
        if (!name || name.length > LIMITS.custom_topic || custom.has(key)) return `${label} has an invalid or duplicate custom topic.`
        custom.add(key)
      }
    }
  }
  return ''
}

export function calculateMetrics(rounds) {
  const counts = { total: rounds.length, cleared: 0, rejected: 0, pending: 0, not_reached: 0, weaknesses: 0 }
  for (const round of rounds) {
    counts[round.status] += 1
    counts.weaknesses += round.weaknesses.length
  }
  const attempted = counts.cleared + counts.rejected
  return { ...counts, attempted, clearanceRate: attempted ? 100 * counts.cleared / attempted : null }
}

export function preparePayload(draft, { categories, topics }) {
  const error = validateCompany(draft) || validateRounds(draft.rounds, categories)
    || validateWeaknesses(draft.rounds, topics)
  if (error) return { error }
  if (draft.rounds.some((round) => round.status === 'rejected') && draft.overall_status !== 'rejected') {
    return { error: 'A rejected round requires a rejected interview outcome.' }
  }

  return { payload: {
    company_name: draft.company_name.trim(),
    job_role: draft.job_role.trim() || null,
    interview_date: draft.interview_date,
    interview_mode: draft.interview_mode || null,
    overall_status: draft.overall_status,
    notes: draft.notes.trim() || null,
    rounds: draft.rounds.map((round) => ({
      round_number: round.round_number,
      round_type_id: categories.find(({ id }) => String(id) === String(round.round_type_id)).id,
      custom_name: round.custom_name.trim() || null,
      round_date: round.round_date || null,
      status: round.status,
      notes: round.notes.trim() || null,
      weaknesses: round.weaknesses.map((weakness) => ({
        topic_id: weakness.topic_id ?? null,
        custom_topic: weakness.custom_topic == null ? null : normalizeTopic(weakness.custom_topic),
        severity: weakness.severity,
        notes: weakness.notes.trim() || null,
      })),
    })),
  } }
}
