import { createAiHandler } from '../_shared/ai-handler.ts'

Deno.serve(createAiHandler('analysis', (name) => Deno.env.get(name)))
