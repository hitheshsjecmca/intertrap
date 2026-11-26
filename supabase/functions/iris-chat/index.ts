import { createAiHandler } from '../_shared/ai-handler.ts'

Deno.serve(createAiHandler('chat', (name) => Deno.env.get(name)))
