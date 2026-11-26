import { supabase } from '../lib/supabase.js'

export async function fetchCatalog(signal) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) throw new Error('Your session has expired. Sign in again to load the catalog.')

  const { data: categories, error: categoryError } = await supabase.from('round_types')
    .select('id,name,slug').order('name').abortSignal(signal)
  if (categoryError) throw new Error(catalogMessage(categoryError))
  if (!categories.length) throw new Error('The round catalog is empty. Run the InterTrap seed script and verify Module 5 read policies.')

  const { data: topics, error: topicError } = await supabase.from('topics')
    .select('id,round_type_id,name').in('round_type_id', categories.map(({ id }) => id))
    .order('name').abortSignal(signal)
  if (topicError) throw new Error(catalogMessage(topicError))
  if (!topics.length) throw new Error('The topic catalog is empty. Run the InterTrap seed script and verify Module 5 read policies.')
  return { categories, topics }
}

function catalogMessage(error) {
  if (['PGRST301', 'PGRST303', '28000'].includes(error.code)) {
    return 'Your session could not be verified. Sign in again to load the catalog.'
  }
  if (['42501', '42P01', 'PGRST204', 'PGRST205'].includes(error.code)) {
    return 'The catalog is unavailable. Verify migrations 001–005 and the seed script in your Supabase project.'
  }
  return 'Could not load the catalog. Check your connection and try again.'
}
