import { and, eq, sql } from 'drizzle-orm'
import { db } from './db'
import { bots, chatMembers, groupChats, runs } from './db/schema'
import type { ChatThread } from './chat-helpers'

export type ThreadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export class ThreadError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function lockIdleThread(tx: ThreadTransaction, userId: string, threadId: string) {
  const [lock] = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, threadId])}, 0)) as acquired`)
  if (!lock?.acquired) throw new ThreadError('Another operation is in progress in this thread', 409)
  const [active] = await tx.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.userId, userId), eq(runs.threadId, threadId), eq(runs.open, true))).limit(1)
  if (active) throw new ThreadError('A reply is already generating in this thread', 409)
}

export async function ownedThread(connection: ThreadTransaction | typeof db, userId: string, threadId: string) {
  const roster = await connection.select({
    id: bots.id,
    userId: bots.userId,
    name: bots.name,
    modelId: bots.modelId,
    soul: bots.soul,
    instructions: bots.instructions,
  }).from(bots).where(eq(bots.userId, userId)).orderBy(bots.id)
  const bot = roster.find((entry) => entry.id === threadId)
  let thread: ChatThread
  if (bot) {
    thread = { name: bot.name, primaryBotId: bot.id, memberIds: [bot.id] }
  } else {
    const [group] = await connection.select().from(groupChats)
      .where(and(eq(groupChats.id, threadId), eq(groupChats.userId, userId)))
    if (!group) throw new ThreadError('Thread not found', 404)
    const members = await connection.select({ id: bots.id }).from(chatMembers)
      .innerJoin(bots, eq(chatMembers.botId, bots.id))
      .where(and(eq(chatMembers.chatId, threadId), eq(bots.userId, userId)))
    thread = { name: group.name, memberIds: members.map((member) => member.id) }
  }
  return { roster, thread }
}
