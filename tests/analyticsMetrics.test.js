import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateReadiness, dateRange, percentagePoints, previousRange, priorityLabel, rate } from '../src/utils/analyticsMetrics.js'
import { dashboardMessage } from '../src/utils/irisResponses.js'

test('readiness weights renormalize over eligible categories and report coverage', () => {
  const score = calculateReadiness([
    { slug: 'aptitude', attempted: 5, clearance_rate: 80 },
    { slug: 'coding', attempted: 5, clearance_rate: 60 },
    { slug: 'technical', attempted: 10, clearance_rate: 70 },
    { slug: 'hr', attempted: 2, clearance_rate: 100 },
    { slug: 'communication', attempted: 10, clearance_rate: 100 },
  ])
  assert.deepEqual(score, { value: 4850 / 70, coverage: 70, sample: 20 })
})

test('insufficient evidence returns null, while an observed zero is valid', () => {
  assert.deepEqual(calculateReadiness([]), { value: null, coverage: 0, sample: 0 })
  assert.deepEqual(calculateReadiness([{ slug: 'hr', attempted: 3, clearance_rate: 0 }]),
    { value: 0, coverage: 15, sample: 3 })
  assert.equal(rate(0, 0), null)
  assert.equal(rate(0, 3), 0)
})

test('date presets and equivalent periods use inclusive contiguous UTC dates', () => {
  const now = new Date('2026-10-31T22:03:00Z')
  assert.deepEqual(dateRange('30', now), { from: '2026-10-02', to: '2026-10-31' })
  assert.deepEqual(dateRange('6m', now), { from: '2026-05-01', to: '2026-10-31' })
  assert.deepEqual(previousRange({ from: '2028-03-01', to: '2028-03-02' }), { from: '2028-02-28', to: '2028-02-29' })
  assert.equal(previousRange({}), null)
})

test('differences use percentage points and priority thresholds are inclusive', () => {
  assert.equal(percentagePoints(65, 50), 15)
  assert.equal(percentagePoints(null, 50), null)
  assert.deepEqual([0, 39.99, 40, 60, 80].map(priorityLabel), ['Low', 'Low', 'Moderate', 'High', 'Critical'])
})

test('I.R.I.S. uses recorded facts to choose dashboard guidance', () => {
  assert.match(dashboardMessage({ summary: { total_interviews: 0 } }), /first interview/)
  assert.match(dashboardMessage({ summary: { total_interviews: 4 }, recent: [], weaknesses: [{ topic: 'Arrays', interviews: 3 }] }), /Arrays.*3 interviews/)
})
