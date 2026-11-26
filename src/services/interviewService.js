import { supabase } from '../lib/supabase.js'

export function requestMessage(error) {
  if (['PGRST202', '42P01', '42703'].includes(error?.code)) return 'This workspace needs the latest InterTrap database migrations.'
  if (error?.code === 'PT409') return 'This save conflicts with a previous request or newer edit. Your draft is still available. Check the saved record before retrying.'
  if (error?.code === 'PT404') return 'Interview unavailable.'
  if (['401', '42501', 'PGRST301', 'PGRST303'].includes(error?.code)) return 'Access denied. Check your session and database setup.'
  if (/^(22|23)/.test(error?.code ?? '')) return 'The database rejected these interview details. Review the round order, outcomes and weakness choices.'
  return 'The request could not be completed. Check your connection and try again.'
}

export async function runRpc(name, parameters, signal) {
  let query = supabase.rpc(name, parameters)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw new Error(requestMessage(error), { cause: error.code })
  return data
}

export const createInterview = (payload, clientRequestId) => runRpc('create_interview', {
  payload, client_request_id: clientRequestId,
})
export const updateInterview = (id, payload, version) => runRpc('update_interview', {
  interview_id: id, payload, expected_version: version,
})
export const deleteInterview = (id) => runRpc('delete_interview', { interview_id: id })

export function getInterviews(filters, page = 1, signal, pageSize = 12) {
  return runRpc('interview_history', {
    search_text: filters.search?.trim() || null, outcome: filters.outcome || null,
    mode: filters.mode || null, from_date: filters.from || null, to_date: filters.to || null,
    sort_by: filters.sort || 'newest', page_number: page, page_size: pageSize,
  }, signal)
}

export async function getInterviewById(id, signal) {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return null
  const { data, error } = await supabase.from('interviews').select(
    'id,version,company_name,job_role,interview_date,interview_mode,overall_status,notes,created_at,updated_at,interview_rounds(id,round_type_id,round_number,custom_name,round_date,status,notes,round_types(id,name),round_weaknesses!round_weaknesses_round_id_fkey(id,topic_id,custom_topic,severity,notes,topics(id,name)))',
  ).eq('id', id).abortSignal(signal).maybeSingle()
  if (error) throw new Error(requestMessage(error))
  return data
}

export function interviewToDraft(record) {
  return {
    company_name: record.company_name,
    job_role: record.job_role ?? '',
    interview_date: record.interview_date,
    interview_mode: record.interview_mode ?? '',
    overall_status: record.overall_status,
    notes: record.notes ?? '',
    rounds: [...record.interview_rounds].sort((a, b) => a.round_number - b.round_number).map((round) => ({
      id: round.id, key: round.id, round_type_id: String(round.round_type_id), round_number: round.round_number,
      custom_name: round.custom_name ?? '', round_date: round.round_date ?? '', status: round.status,
      notes: round.notes ?? '',
      weaknesses: round.round_weaknesses.map((weakness) => ({
        id: weakness.id, key: weakness.id, topic_id: weakness.topic_id, custom_topic: weakness.custom_topic,
        severity: weakness.severity, notes: weakness.notes ?? '',
      })),
    })),
  }
}

export function interviewCatalog(record) {
  return {
    categories: record.interview_rounds.map((round) => round.round_types).filter(Boolean),
    topics: record.interview_rounds.flatMap((round) => round.round_weaknesses.map((weakness) => weakness.topics)).filter(Boolean),
  }
}
