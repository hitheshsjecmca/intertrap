import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyProgression, calculateMetrics, moveRound, preparePayload, reviseRounds, topicsForRound,
  validateCompany, validateCustomTopic, validateRounds, validateWeaknesses,
} from '../src/utils/interviewDraft.js'

const categories = [{ id: 42, slug: 'technical' }, { id: 73, slug: 'coding' }]
const topics = [{ id: 27, round_type_id: 42 }, { id: 29, round_type_id: 42 }, { id: 31, round_type_id: 73 }]
const catalog = { categories, topics }
const round = (key, status = 'pending', weaknesses = []) => ({
  key, status, weaknesses, custom_name: '', round_date: '', notes: '', round_type_id: '42',
})
const predefined = (id) => ({ topic_id: id, custom_topic: null, severity: 3, notes: '' })
const custom = (name) => ({ topic_id: null, custom_topic: name, severity: 4, notes: '' })
const draft = (rounds = []) => ({
  company_name: ' Example ', job_role: '', interview_date: '2028-02-29', interview_mode: '',
  overall_status: 'pending', notes: '', rounds: applyProgression(rounds),
})

test('company validation requires a nonblank name and real calendar date', () => {
  assert.match(validateCompany({ ...draft(), company_name: ' \t' }), /company name/)
  assert.match(validateCompany({ ...draft(), interview_date: '2026-02-29' }), /date/)
  assert.match(validateCompany({ ...draft(), interview_mode: 'blended' }), /mode/)
  assert.equal(validateCompany(draft()), '')
})

test('adding, removing and reordering repeated categories preserves keys and renumbers', () => {
  const rounds = [round('a'), round('b'), round('c')]
  const reordered = moveRound(rounds, 2, -1).filter(({ key }) => key !== 'a')
  const next = applyProgression([...reordered, round('d')])
  assert.deepEqual(next.map(({ key, round_number }) => [key, round_number]), [['c', 1], ['b', 2], ['d', 3]])
  assert.deepEqual(rounds.map(({ key }) => key), ['a', 'b', 'c'])
  assert.equal(validateRounds(next, categories), '')
})

test('first rejection clears incompatible outcomes and weaknesses', () => {
  const rounds = [round('a', 'rejected'), round('b', 'cleared', [predefined(27)]), round('c', 'rejected')]
  const next = reviseRounds(draft(), rounds)
  assert.equal(next.overall_status, 'rejected')
  assert.deepEqual(next.rounds.map(({ status }) => status), ['rejected', 'not_reached', 'not_reached'])
  assert.equal(next.rounds[1].weaknesses.length, 0)
  assert.equal(rounds[1].weaknesses.length, 1)
})

test('middle rejection and correction reset later rounds to pending', () => {
  const initial = reviseRounds(draft(), [round('a', 'cleared'), round('b', 'rejected'), round('c', 'cleared')])
  assert.deepEqual(initial.rounds.map(({ status }) => status), ['cleared', 'rejected', 'not_reached'])
  const corrected = reviseRounds(initial, initial.rounds.map((item) => item.key === 'b' ? { ...item, status: 'cleared' } : item))
  assert.deepEqual(corrected.rounds.map(({ status }) => status), ['cleared', 'cleared', 'pending'])
  assert.equal(corrected.overall_status, 'pending')
  const allCleared = reviseRounds(corrected, corrected.rounds.map((item) => ({ ...item, status: 'cleared' })))
  assert.equal(allCleared.overall_status, 'pending')
})

test('catalog filtering and weakness validation use the selected category', () => {
  assert.deepEqual(topicsForRound(topics, '42').map(({ id }) => id), [27, 29])
  const selected = [predefined(27), predefined(29), custom('White  Space')]
  const rounds = draft([round('a', 'cleared', selected)]).rounds
  assert.equal(validateWeaknesses(rounds, topics), '')
  assert.match(validateWeaknesses([{ ...rounds[0], round_type_id: '73' }], topics), /predefined/)
  assert.match(validateWeaknesses([{ ...rounds[0], status: 'pending' }], topics), /attempted/)
  assert.match(validateWeaknesses(draft([round('a', 'cleared', [predefined(27), predefined(27)])]).rounds, topics), /duplicate/)
  assert.match(validateWeaknesses(draft([round('a', 'cleared', [{ ...predefined(27), severity: 6 }])]).rounds, topics), /severity/)
})

test('custom topic requires a unique nonblank normalized label', () => {
  assert.match(validateCustomTopic(' \n ', []), /Enter/)
  assert.match(validateCustomTopic('  white\tSPACE ', [custom('White Space')]), /already/)
  assert.equal(validateCustomTopic('Exception handling', [custom('White Space')]), '')
  assert.match(validateWeaknesses(draft([round('a', 'cleared', [custom('A B'), custom(' a  b ')])]).rounds, topics), /duplicate/)
})

test('clearance rate counts only known outcomes and is null with zero attempted rounds', () => {
  const metrics = calculateMetrics(applyProgression([
    round('a', 'cleared', [predefined(27)]), round('b'), round('c', 'rejected'), round('d'),
  ]))
  assert.deepEqual(metrics, {
    total: 4, cleared: 1, rejected: 1, pending: 1, not_reached: 1, weaknesses: 1, attempted: 2, clearanceRate: 50,
  })
  assert.equal(calculateMetrics(applyProgression([round('a')])).clearanceRate, null)
})

test('payload uses actual catalog IDs and omits ownership, internal keys and derived joins', () => {
  const state = draft([round('a', 'cleared', [custom('  White  Space '), predefined(27)])])
  const { payload } = preparePayload(state, catalog)
  assert.equal(payload.company_name, 'Example')
  assert.equal(payload.interview_mode, null)
  assert.equal(payload.rounds[0].round_type_id, 42)
  assert.deepEqual(payload.rounds[0].weaknesses[0], { topic_id: null, custom_topic: 'White Space', severity: 4, notes: null })
  assert.equal(payload.rounds[0].weaknesses[1].topic_id, 27)
  assert.equal('round_type_id' in payload.rounds[0].weaknesses[1], false)
  assert.equal('user_id' in payload, false)
  assert.equal('key' in payload.rounds[0], false)
  assert.match(preparePayload(draft([round('a', 'rejected')]), catalog).error, /rejected interview/)
})
