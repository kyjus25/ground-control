import { createServerFn } from '@tanstack/solid-start'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { bots } from './db/schema'
import { getSessionUser } from './auth'
import { BotInputSchema, BotInputWithIdSchema } from '../types/bot-schemas'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export const listBots = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  return db
    .select({
      id: bots.id,
      name: bots.name,
      emoji: bots.emoji,
      color: bots.color,
      shape: bots.shape,
      category: bots.category,
      modelId: bots.modelId,
      skills: bots.skills,
    })
    .from(bots)
    .where(eq(bots.userId, user.id))
})

export const getBot = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [bot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, data.id), eq(bots.userId, user.id)))
    return bot ?? null
  })

export const createBot = createServerFn({ method: 'POST' })
  .validator(BotInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [bot] = await db
      .insert(bots)
      .values({
        userId: user.id,
        name: data.name.trim(),
        emoji: data.emoji,
        color: data.color,
        shape: data.shape,
        category: data.category?.trim() || null,
        soul: data.soul?.trim() || null,
        instructions: data.instructions?.trim() || null,
        modelId: data.modelId?.trim() || null,
      })
      .returning({ id: bots.id })
    return bot
  })

export const updateBot = createServerFn({ method: 'POST' })
  .validator(BotInputWithIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .update(bots)
      .set({
        name: data.name.trim(),
        emoji: data.emoji,
        color: data.color,
        shape: data.shape,
        category: data.category?.trim() || null,
        soul: data.soul?.trim() || null,
        instructions: data.instructions?.trim() || null,
        modelId: data.modelId?.trim() || null,
      })
      .where(and(eq(bots.id, data.id), eq(bots.userId, user.id)))
  })

export const deleteBot = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db.delete(bots).where(and(eq(bots.id, data.id), eq(bots.userId, user.id)))
  })
