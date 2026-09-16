import { createServerFn } from '@tanstack/solid-start'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { bots, groupChats, threadWorkspaces, workspaces } from './db/schema'
import { getSessionUser } from './auth'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

// Until M3 gives threads their own table, a thread id is either a 1:1 bot
// chat (the bot's uuid) or a group chat; either way it must be owned.
async function requireOwnedThread(threadId: string, userId: string) {
  const [chat] = await db
    .select({ id: groupChats.id })
    .from(groupChats)
    .where(and(eq(groupChats.id, threadId), eq(groupChats.userId, userId)))
  if (chat) return
  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, threadId), eq(bots.userId, userId)))
  if (!bot) throw new Error('Thread not found')
}

export const listWorkspaces = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  return db.select().from(workspaces).where(eq(workspaces.userId, user.id))
})

export const createWorkspace = createServerFn({ method: 'POST' })
  .validator((d: { name: string; path?: string; endpoint?: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [workspace] = await db
      .insert(workspaces)
      .values({
        userId: user.id,
        name: data.name.trim(),
        path: data.path?.trim() || null,
        endpoint: data.endpoint?.trim() || null,
      })
      .returning()
    return workspace
  })

export const deleteWorkspace = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .delete(workspaces)
      .where(and(eq(workspaces.id, data.id), eq(workspaces.userId, user.id)))
  })

// Workspaces attached to a thread.
export const listThreadWorkspaces = createServerFn({ method: 'POST' })
  .validator((d: { threadId: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await requireOwnedThread(data.threadId, user.id)
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        path: workspaces.path,
        endpoint: workspaces.endpoint,
      })
      .from(threadWorkspaces)
      .innerJoin(workspaces, eq(threadWorkspaces.workspaceId, workspaces.id))
      .where(eq(threadWorkspaces.threadId, data.threadId))
  })

export const attachThreadWorkspace = createServerFn({ method: 'POST' })
  .validator((d: { threadId: string; workspaceId: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await requireOwnedThread(data.threadId, user.id)
    const [ws] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, data.workspaceId), eq(workspaces.userId, user.id)))
    if (!ws) throw new Error('Workspace not found')
    await db
      .insert(threadWorkspaces)
      .values({ threadId: data.threadId, workspaceId: data.workspaceId })
      .onConflictDoNothing()
  })

export const detachThreadWorkspace = createServerFn({ method: 'POST' })
  .validator((d: { threadId: string; workspaceId: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await requireOwnedThread(data.threadId, user.id)
    await db
      .delete(threadWorkspaces)
      .where(and(eq(threadWorkspaces.threadId, data.threadId), eq(threadWorkspaces.workspaceId, data.workspaceId)))
  })
