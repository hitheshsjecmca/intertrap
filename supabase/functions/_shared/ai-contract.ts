export type Kind = 'analysis' | 'chat'
type Data = Record<string, unknown>
type StringList = string[]
export type Report = {
  summary: string
  strengths: StringList
  weaknesses: StringList
  recommendations: StringList
  roadmap: { day: number; focus: string; task: string }[]
  guidance: { technical: StringList; coding: StringList; communication: StringList; feedback: string }
}

export class AiError extends Error {
  status: number
  code: string
  resetAt?: string

  constructor(status: number, code: string, message: string, resetAt?: string) {
    super(message)
    this.status = status
    this.code = code
    this.resetAt = resetAt
  }
}

export function object(value: unknown): Data | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null
}

function exact(data: Data, keys: string[]) {
  return Object.keys(data).length === keys.length && keys.every((key) => Object.hasOwn(data, key))
}

export function redact(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[redacted identifier]')
    .replace(/\b(?:eyJ[\w-]+\.[\w-]+\.[\w-]+|AIza[\w-]{30,}|sb_secret_[\w-]+|sk-[\w-]{16,})\b/g, '[redacted key]')
    .replace(/\b(password|passcode|api[_ -]?key|client[_ -]?secret|access[_ -]?token|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+[\w./+=-]+/gi, 'Bearer [redacted]')
}

function invalidResponse(): never {
  throw new AiError(502, 'invalid_output', 'Gemini returned an invalid response. Try again later.')
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || !value.trim()) invalidResponse()
  return redact(value.trim())
}

function list(value: unknown): StringList {
  if (!Array.isArray(value) || value.length > 5) invalidResponse()
  return value.map((item) => text(item, 320))
}

export function validateReport(value: unknown): Report {
  const data = object(value)
  if (!data || !exact(data, ['summary', 'strengths', 'weaknesses', 'recommendations', 'roadmap', 'guidance'])) invalidResponse()
  if (!Array.isArray(data.roadmap) || data.roadmap.length !== 7) invalidResponse()
  const roadmap = data.roadmap.map((entry, index) => {
    const day = object(entry)
    if (!day || !exact(day, ['day', 'focus', 'task']) || day.day !== index + 1) invalidResponse()
    return { day: index + 1, focus: text(day.focus, 120), task: text(day.task, 320) }
  })
  const guidance = object(data.guidance)
  if (!guidance || !exact(guidance, ['technical', 'coding', 'communication', 'feedback'])) invalidResponse()
  return {
    summary: text(data.summary, 800),
    strengths: list(data.strengths), weaknesses: list(data.weaknesses), recommendations: list(data.recommendations),
    roadmap,
    guidance: {
      technical: list(guidance.technical), coding: list(guidance.coding), communication: list(guidance.communication),
      feedback: text(guidance.feedback, 800),
    },
  }
}

export function validateChat(value: unknown) {
  const data = object(value)
  if (!data || !exact(data, ['answer', 'next_steps'])) invalidResponse()
  return { answer: text(data.answer, 1600), next_steps: list(data.next_steps) }
}

const str = { type: 'string' }
const strings = { type: 'array', items: str, maxItems: 5 }
const schema = (properties: Data) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

export const schemas = {
  analysis: schema({
    summary: str, strengths: strings, weaknesses: strings, recommendations: strings,
    roadmap: { type: 'array', minItems: 7, maxItems: 7, items: schema({ day: { type: 'integer', minimum: 1, maximum: 7 }, focus: str, task: str }) },
    guidance: schema({ technical: strings, coding: strings, communication: strings, feedback: str }),
  }),
  chat: schema({ answer: str, next_steps: strings }),
}

export async function limitedJson(message: Request | Response, maxBytes: number, invalid: () => Error, signal?: AbortSignal) {
  const reader = message.body?.getReader()
  if (!reader) throw invalid()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let raw = ''
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    if (signal?.aborted) { cancel(); throw invalid() }
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        void reader.cancel().catch(() => {})
        throw invalid()
      }
      raw += decoder.decode(value, { stream: true })
    }
    if (signal?.aborted) throw invalid()
    return JSON.parse(raw + decoder.decode()) as unknown
  } catch {
    throw invalid()
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)

export function readInput(kind: 'analysis', value: unknown): { interview_id: string }
export function readInput(kind: 'chat', value: unknown): { question: string; previous_question?: string }
export function readInput(kind: Kind, value: unknown) {
  const data = object(value)
  if (!data || data.consent !== true) {
    throw new AiError(400, 'consent_required', 'Confirm that relevant information may be sent to Gemini.')
  }
  if (kind === 'analysis' && exact(data, ['consent', 'interview_id']) && isUuid(data.interview_id)) {
    return { interview_id: data.interview_id }
  }
  if (kind === 'chat' && exact(data, data.previous_question === undefined
    ? ['consent', 'question'] : ['consent', 'question', 'previous_question'])) {
    const valid = (input: unknown): input is string => typeof input === 'string' && input.length <= 600 && Boolean(input.trim())
    if (valid(data.question) && (data.previous_question === undefined || valid(data.previous_question))) {
      return { question: redact(data.question.trim()),
        previous_question: typeof data.previous_question === 'string' ? redact(data.previous_question.trim()) : undefined }
    }
  }
  throw new AiError(400, 'invalid_request', kind === 'analysis'
    ? 'Supply a valid interview ID.' : 'Enter a question of up to 600 characters.')
}
