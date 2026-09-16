import { createServerFn } from '@tanstack/solid-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { bots, chatMembers, groupChats } from './db/schema'
import { getSessionUser } from './auth'
import type { BotColor, BotShape } from '../types/bot'

export type ChatMember = {
  id: string
  name: string
  emoji: string
  color: BotColor
  shape: BotShape
}

export type GroupChat = {
  id: string
  name: string
  members: ChatMember[]
}

async function membersFor(userIds: { userId: string; chatIds: string[] }): Promise<Map<string, ChatMember[]>> {
  if (userIds.chatIds.length === 0) return new Map()
  const rows = await db
    .select({
      chatId: chatMembers.chatId,
      id: bots.id,
      name: bots.name,
      emoji: bots.emoji,
      color: bots.color,
      shape: bots.shape,
    })
    .from(chatMembers)
    .innerJoin(bots, eq(chatMembers.botId, bots.id))
    .where(and(eq(bots.userId, userIds.userId), inArray(chatMembers.chatId, userIds.chatIds)))
    .orderBy(asc(chatMembers.botId))
  const map = new Map<string, ChatMember[]>()
  for (const row of rows) {
    const list = map.get(row.chatId) ?? []
    list.push({ id: row.id, name: row.name, emoji: row.emoji, color: row.color, shape: row.shape })
    map.set(row.chatId, list)
  }
  return map
}

// All group chats for the user, each with its member bots.
export const listChats = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  const chats = await db
    .select({ id: groupChats.id, name: groupChats.name })
    .from(groupChats)
    .where(eq(groupChats.userId, user.id))
    .orderBy(asc(groupChats.createdAt))
  const members = await membersFor({ userId: user.id, chatIds: chats.map((c) => c.id) })
  return chats.map((c) => ({ id: c.id, name: c.name, members: members.get(c.id) ?? [] }))
})

export const getGroupChat = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Unauthorized')
    const [chat] = await db
      .select({ id: groupChats.id, name: groupChats.name })
      .from(groupChats)
      .where(and(eq(groupChats.id, data.id), eq(groupChats.userId, user.id)))
    if (!chat) return null
    const members = await membersFor({ userId: user.id, chatIds: [chat.id] })
    return { id: chat.id, name: chat.name, members: members.get(chat.id) ?? [] }
  })

export const createGroupChat = createServerFn({ method: 'POST' })
  .validator((d: { name: string; botIds: string[] }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Unauthorized')
    const name = data.name.trim()
    if (!name) throw new Error('Chat name is required')
    const botIds = [...new Set(data.botIds)]
    if (botIds.length === 0) throw new Error('Pick at least one bot')

    const memberBots = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(eq(bots.userId, user.id), inArray(bots.id, botIds)))
    if (memberBots.length !== botIds.length) throw new Error('Unknown bot in member list')

    const [chat] = await db
      .insert(groupChats)
      .values({ userId: user.id, name })
      .returning({ id: groupChats.id })
    await db.insert(chatMembers).values(botIds.map((botId) => ({ chatId: chat.id, botId })))
    return { id: chat.id }
  })
