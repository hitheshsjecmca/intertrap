import { getInterviews, runRpc } from './interviewService.js'
import { previousRange } from '../utils/analyticsMetrics.js'

function snapshot({ from = '', to = '' }, signal) {
  return runRpc('performance_snapshot', { from_date: from || null, to_date: to || null }, signal)
}

export async function getPerformance(range, signal) {
  const previous = previousRange(range)
  const [current, comparison] = await Promise.all([snapshot(range, signal), previous ? snapshot(previous, signal) : null])
  return { ...current, comparison }
}

export async function getDashboard(signal) {
  const [data, recent] = await Promise.all([snapshot({}, signal), getInterviews({}, 1, signal, 4)])
  return { ...data, recent: recent.rows }
}

export const getWeaknesses = (range, signal) => snapshot(range, signal)

export const getWeaknessEvidence = (topic, range, page, signal) => runRpc('weakness_evidence', {
  topic_key: topic, from_date: range.from || null, to_date: range.to || null, page_number: page,
}, signal)
