import { createServerFn } from '@tanstack/solid-start'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { groupChats } from './db/schema'
import { getSessionUser } from './auth'

export const listChats = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  return db
    .select({ id: groupChats.id, name: groupChats.name, membersLabel: groupChats.membersLabel })
    .from(groupChats)
    .where(eq(groupChats.userId, user.id))
})
