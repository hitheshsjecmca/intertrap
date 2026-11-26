import { AiError, isUuid, limitedJson, object, readInput, validateReport } from './ai-contract.ts'
import type { Kind } from './ai-contract.ts'
import { generate, providerConfig } from './gemini.ts'

type Environment = (name: string) => string | undefined
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, x-sb-client-platform, x-sb-client-platform-version, x-sb-client-runtime, x-sb-client-runtime-version',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Cache-Control': 'no-store',
}

function json(body: unknown, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...cors, ...headers } })
}

function credential(env: Environment, keys: string, fallbacks: string[]) {
  const value = env(keys)
  if (value) {
    try {
      const key = object(JSON.parse(value))?.default
      if (typeof key === 'string' && key) return key
    } catch { /* fall back to the single-key runtime configuration */ }
  }
  return fallbacks.map(env).find(Boolean)
}

function setup(env: Environment, fetcher: typeof fetch, jwt: string, signal: AbortSignal) {
  const url = env('SUPABASE_URL')?.replace(/\/$/, '')
  const publishable = credential(env, 'SUPABASE_PUBLISHABLE_KEYS', ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'])
  if (!url || !publishable) throw new AiError(503, 'configuration', 'AI is unavailable. Check the Edge Function configuration.')

  const userHeaders = { apikey: publishable, Authorization: 'Bearer ' + jwt }
  async function call(path: string, headers: Record<string, string>, payload?: unknown, deadline = signal) {
    try {
      const response = await fetcher(url + path, {
        method: payload === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)]),
      })
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        if (path === '/auth/v1/user' && [401, 403].includes(response.status)) {
          throw new AiError(401, 'authentication', 'Sign in again to use I.R.I.S.')
        }
        throw new AiError(503, 'database_unavailable', 'AI data is unavailable. Verify the database setup or try again later.')
      }
      if (response.status === 204) return null
      return limitedJson(response, 128_000, () => new AiError(503, 'database_unavailable', 'AI data is unavailable.'))
    } catch (error) {
      if (error instanceof AiError) throw error
      throw new AiError(503, 'database_unavailable', 'AI data is unavailable. Try again later.')
    }
  }

  return {
    getUser: () => call('/auth/v1/user', userHeaders),
    userRpc: (name: string, args: unknown = {}) => call('/rest/v1/rpc/' + name, userHeaders, args),
    serverRpc(name: string, args: unknown, deadline?: AbortSignal) {
      const key = credential(env, 'SUPABASE_SECRET_KEYS', ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
      if (!key) throw new AiError(503, 'configuration', 'AI is unavailable. Check the Edge Function configuration.')
      const headers: Record<string, string> = { apikey: key }
      if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key
      return call('/rest/v1/rpc/' + name, headers, args, deadline)
    },
  }
}

function dailyLimit(env: Environment, kind: Kind) {
  const raw = env(kind === 'analysis' ? 'AI_ANALYSIS_DAILY_LIMIT' : 'AI_CHAT_DAILY_LIMIT')
  if (!raw) return kind === 'analysis' ? 5 : 20
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AiError(503, 'configuration', 'AI is unavailable. Check the Edge Function configuration.')
  }
  return limit
}

function reservationError(state: unknown, resetAt: unknown): never {
  if (state === 'limited') {
    throw new AiError(429, 'rate_limited', 'Your daily I.R.I.S. limit has been reached.',
      typeof resetAt === 'string' ? resetAt : undefined)
  }
  if (state === 'busy') throw new AiError(409, 'analysis_in_progress', 'An analysis is already running. Reload saved reports shortly.')
  if (state === 'stale') throw new AiError(409, 'interview_changed', 'The interview changed. Reload it before generating an analysis.')
  if (state === 'unavailable') throw new AiError(404, 'interview_unavailable', 'Interview unavailable.')
  throw new AiError(503, 'database_unavailable', 'AI data is unavailable. Try again later.')
}

function reportRow(value: unknown) {
  const data = object(value)
  if (!data || !isUuid(data.id) || !Number.isInteger(data.interview_version) || typeof data.created_at !== 'string') {
    throw new AiError(503, 'database_unavailable', 'The saved report could not be verified.')
  }
  const { summary, strengths, weaknesses, recommendations, roadmap, guidance } = data
  return {
    ...validateReport({ summary, strengths, weaknesses, recommendations, roadmap, guidance }),
    id: data.id, interview_version: data.interview_version, created_at: data.created_at,
  }
}

function chatEvidence(performance: Record<string, unknown>, question: string) {
  const aboutGrowth = /growth|improv|trend|month|compar/i.test(question)
  const aboutWeakness = /weak|priorit|study|prepar|practice|plan|coding|communicat/i.test(question)
  const aboutRejection = /reject|fail|first.round|outcome|histor/i.test(question)
  const general = !aboutGrowth && !aboutWeakness && !aboutRejection
  return {
    window_days: performance.window_days, summary: performance.summary, categories: performance.categories,
    monthly: aboutGrowth || general ? performance.monthly : undefined,
    weaknesses: aboutWeakness || aboutRejection || general ? performance.weaknesses : undefined,
    recent_outcomes: aboutRejection || aboutGrowth || general ? performance.recent_outcomes : undefined,
  }
}

export function createAiHandler(kind: Kind, env: Environment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ code: 'method', message: 'Send a POST request.' }, 405, { Allow: 'POST, OPTIONS' })
    const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(42_000)])
    try {
      const jwt = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
      if (!jwt) throw new AiError(401, 'authentication', 'Sign in to use I.R.I.S.')
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
        throw new AiError(415, 'content_type', 'Send JSON to this endpoint.')
      }
      const db = setup(env, fetcher, jwt, deadline)
      const user = object(await db.getUser())
      if (!isUuid(user?.id) || user?.role !== 'authenticated' || user.is_anonymous === true) {
        throw new AiError(401, 'authentication', 'Sign in to use I.R.I.S.')
      }
      const actor = user.id
      const body = await limitedJson(request, 4800, () => new AiError(400, 'invalid_request', 'Invalid or oversized JSON request.'), deadline)
      if (kind === 'chat') {
        const input = readInput('chat', body)
        const evidence = object(await db.userRpc('ai_performance_context'))
        const summary = object(evidence?.summary)
        if (!evidence || !summary) throw new AiError(503, 'database_unavailable', 'AI data is unavailable.')
        if (summary.total_interviews === 0) return json({
          answer: 'There are no recorded interviews in the last 180 days to analyse. Record an interview to get evidence-based guidance.',
          next_steps: ['Record an interview and add the outcomes of any attempted rounds.'], source: 'workspace',
        })
        const config = providerConfig(env)
        const slot = object(await db.serverRpc('ai_reserve', { actor, kind, daily_limit: dailyLimit(env, kind) }))
        if (slot?.state !== 'reserved') reservationError(slot?.state, slot?.reset_at)
        const result = await generate(kind, {
          ...input, evidence: chatEvidence(evidence, input.question + ' ' + (input.previous_question ?? '')),
        }, config, fetcher, deadline)
        return json({ ...result, source: 'gemini', remaining: slot.remaining })
      }

      const { interview_id: target_id } = readInput('analysis', body)
      const context = object(await db.userRpc('ai_interview_context', { target_id }))
      if (!context) reservationError('unavailable', null)
      const { version: target_version, ...interview } = context
      if (!Number.isInteger(target_version)) throw new AiError(503, 'database_unavailable', 'The interview version could not be verified.')
      const config = providerConfig(env)
      const args = { actor, target_id, target_version }
      const slot = object(await db.serverRpc('ai_reserve', { ...args, kind, daily_limit: dailyLimit(env, kind) }))
      if (slot?.state === 'cached') return json({ analysis: reportRow(slot.analysis), cached: true })
      if (slot?.state !== 'reserved' || !isUuid(slot.lease)) reservationError(slot?.state, slot?.reset_at)
      const token = slot.lease
      try {
        const evidence = object(await db.userRpc('ai_performance_context'))
        if (!evidence) throw new AiError(503, 'database_unavailable', 'AI data is unavailable.')
        const report = await generate(kind, { interview, evidence }, config, fetcher, deadline)
        const saved = await db.serverRpc('ai_finish_analysis', { ...args, token, model: config.model, report })
        if (saved == null) reservationError('stale', null)
        return json({ analysis: reportRow(saved), cached: false, remaining: slot.remaining })
      } catch (error) {
        // Keep the lease until expiry if the provider may still be processing a timed-out request.
        if (!(error instanceof AiError && error.code === 'timeout')) {
          try { await db.serverRpc('ai_release_analysis', { ...args, token }, AbortSignal.timeout(2500)) } catch { /* lease expires */ }
        }
        throw error
      }
    } catch (error) {
      const safe = error instanceof AiError ? error : new AiError(500, 'internal', 'I.R.I.S. could not complete this request.')
      const retry = safe.resetAt && Date.parse(safe.resetAt) - Date.now()
      return json({ code: safe.code, message: safe.message, reset_at: safe.resetAt }, safe.status,
        typeof retry === 'number' && Number.isFinite(retry) ? { 'Retry-After': String(Math.max(0, Math.ceil(retry / 1000))) } : {})
    }
  }
}
