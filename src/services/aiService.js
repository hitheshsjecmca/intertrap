import { supabase } from '../lib/supabase.js'

async function invoke(name, body, signal) {
  const { data, error } = await supabase.functions.invoke(name, { body, signal })
  if (!error && data) return data
  const response = error?.context
  let details
  if (response instanceof Response) {
    try { details = await response.json() } catch { /* gateway errors may not be JSON */ }
  }
  const reset = details?.reset_at && new Date(details.reset_at)
  if (response?.status === 429 || details?.code === 'rate_limited') {
    throw new Error(reset && Number.isFinite(reset.valueOf())
      ? `Daily I.R.I.S. limit reached. Try again after ${reset.toLocaleString()}.`
      : 'Daily I.R.I.S. limit reached. Try again after midnight UTC.')
  }
  if (response?.status === 401 || response?.status === 403) throw new Error('Sign in again to use I.R.I.S.')
  if (details?.code && typeof details.message === 'string') throw new Error(details.message)
  if (response?.status === 404) throw new Error('The AI function is unavailable. Check the Module 12 deployment.')
  throw new Error('I.R.I.S. is unavailable. Check your connection and try again.')
}

export const analyzeInterview = (interviewId, signal) => invoke('analyze-interview', {
  interview_id: interviewId, consent: true,
}, signal)

export const askIris = (question, previousQuestion, signal) => invoke('iris-chat', {
  question, previous_question: previousQuestion || undefined, consent: true,
}, signal)

export async function getSavedAnalyses(interviewId, signal) {
  const { data, error } = await supabase.from('ai_analysis')
    .select('id,interview_version,prompt_version,created_at,summary,strengths,weaknesses,recommendations,roadmap,guidance')
    .eq('interview_id', interviewId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(20).abortSignal(signal)
  if (error) throw new Error(['42703', 'PGRST204'].includes(error.code)
    ? 'Saved AI reports require migration 008.'
    : 'Saved AI reports could not be loaded. Check your connection and try again.')
  return data
}
