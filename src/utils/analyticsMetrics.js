export const READINESS = {
  minimum: 3,
  weights: { aptitude: 20, coding: 25, technical: 25, gd: 15, hr: 15 },
}

export const percent = (value) => value == null ? 'Insufficient data' : `${Number(value).toFixed(1)}%`
export const rate = (part, total) => total > 0 ? 100 * part / total : null

export function calculateReadiness(categories, config = READINESS) {
  let weight = 0
  let weightedRate = 0
  let sample = 0
  for (const category of categories) {
    const configuredWeight = config.weights[category.slug]
    if (!configuredWeight || category.attempted < config.minimum || category.clearance_rate == null) continue
    weight += configuredWeight
    weightedRate += category.clearance_rate * configuredWeight
    sample += category.attempted
  }
  return {
    value: weight ? weightedRate / weight : null,
    coverage: rate(weight, Object.values(config.weights).reduce((sum, value) => sum + value, 0)),
    sample,
  }
}

export function priorityLabel(score) {
  if (score >= 80) return 'Critical'
  if (score >= 60) return 'High'
  if (score >= 40) return 'Moderate'
  return 'Low'
}

export function percentagePoints(current, previous) {
  if (current == null || previous == null) return null
  return current - previous
}

const day = 86_400_000
const isoDate = (date) => date.toISOString().slice(0, 10)

export function dateRange(preset, now = new Date()) {
  const to = isoDate(now)
  const start = new Date(to)
  if (preset === '30' || preset === '90') return { from: isoDate(new Date(start.valueOf() - (Number(preset) - 1) * day)), to }
  if (preset === '6m') {
    const date = start.getUTCDate()
    start.setUTCDate(1)
    start.setUTCMonth(start.getUTCMonth() - 6)
    const last = new Date(start.valueOf())
    last.setUTCMonth(last.getUTCMonth() + 1, 0)
    start.setUTCDate(Math.min(date, last.getUTCDate()))
    start.setUTCDate(start.getUTCDate() + 1)
    return { from: isoDate(start), to }
  }
  return { from: '', to: '' }
}

export function previousRange({ from, to }) {
  if (!from || !to || from > to) return null
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { from: isoDate(new Date(start - (end - start) - day)), to: isoDate(new Date(start - day)) }
}
