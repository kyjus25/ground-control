import { createServerFn } from '@tanstack/solid-start'
import { chat } from '@tanstack/ai'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { bots } from './db/schema'
import { getSessionUser } from './auth'
import { systemPromptsFor } from './chat-helpers'
import { DEFAULT_MODEL_ID, ZAI_MODELS } from '../types/ai'
import { adapterFor } from './model-adapter'
import { createSpeakerStorage } from './speaker-storage'

export const aiStatus = createServerFn({ method: 'GET' }).handler(() => ({
  configured: Boolean(process.env.ZAI_API_KEY),
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
    if (!process.env.ZAI_API_KEY) {
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
    const roster = await db.select().from(bots).where(eq(bots.userId, user.id))
    const storage = await createSpeakerStorage({ userId: user.id, botId: bot.id, threadId: bot.id })
    const reply = await chat({
      adapter: adapterFor(bot.modelId),
      messages: data.messages,
      systemPrompts: [...systemPromptsFor(bot, { name: bot.name, primaryBotId: bot.id, memberIds: [bot.id] }, roster), ...storage.systemPrompts],
      tools: storage.tools,
      agentLoopStrategy: storage.agentLoopStrategy,
      stream: false,
    })
    return { reply }
  })

export { DEFAULT_MODEL_ID }
