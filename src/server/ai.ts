import { createServerFn } from '@tanstack/solid-start'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { chat } from '@tanstack/ai'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { bots } from './db/schema'
import { getSessionUser } from './auth'
import { DEFAULT_MODEL_ID, ZAI_MODELS, type ZaiModelId } from '../types/ai'

// Z.AI speaks the OpenAI Chat Completions protocol, so TanStack AI's generic
// compatible adapter covers it — only the base URL and key differ.
const zai = openaiCompatible({
  name: 'zai',
  baseURL: Bun.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
  apiKey: Bun.env.ZAI_API_KEY || '',
  models: ZAI_MODELS.map((m) => m.id),
})

function adapterFor(modelId: string) {
  const known = ZAI_MODELS.some((m) => m.id === modelId)
  if (!known) {
    throw new Error(`Unknown model "${modelId}" — pick one in the bot editor`)
  }
  return zai(modelId as ZaiModelId)
}

export const aiStatus = createServerFn({ method: 'GET' }).handler(() => ({
  configured: Boolean(Bun.env.ZAI_API_KEY),
  models: ZAI_MODELS,
}))

// Minimal M2 plumbing: one blocking completion per call. M3 swaps this for
// streamed chat via the ai-solid hooks and the AI devtools panel lights up.
export const generateBotReply = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      botId: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
    }) => d,
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Unauthorized')
    if (!Bun.env.ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY is not set — add your key to .env')
    }
    const [bot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, data.botId), eq(bots.userId, user.id)))
    if (!bot) throw new Error('Bot not found')
    if (!bot.modelId) {
      throw new Error('This bot has no model assigned — pick one in the bot editor')
    }
    const system = [bot.soul, bot.instructions].filter(Boolean).join('\n\n')
    const reply = await chat({
      adapter: adapterFor(bot.modelId),
      messages: data.messages,
      ...(system ? { system } : {}),
      stream: false,
    })
    return { reply }
  })

export { DEFAULT_MODEL_ID }
