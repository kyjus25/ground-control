import { createServerFn } from '@tanstack/solid-start'
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db'
import { messages } from './db/schema'
import { getSessionUser } from './auth'

// Transcript for a thread (1:1 bot thread or group chat), oldest first.
export const listMessages = createServerFn({ method: 'GET' })
  .validator((d: { threadId: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Unauthorized')
    return db
      .select({
        id: messages.id,
        senderType: messages.senderType,
        senderBotId: messages.senderBotId,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.userId, user.id), eq(messages.threadId, data.threadId)))
      .orderBy(asc(messages.createdAt))
  })
