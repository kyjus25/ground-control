import type { InferInput } from 'valibot'
import { getSessionUser } from './auth'
import { db } from './db'
import { authorizeThreadStorage, createThreadStorage } from './storage'
import { ThreadStorageSchema, UpdateThreadMemorySchema } from '../types/storage-schemas'

export async function requireThreadStorage(threadId: string) {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  return authorizeThreadStorage(db, user.id, threadId)
}

export async function getThreadMemory({ data }: { data: InferInput<typeof ThreadStorageSchema> }) {
  return createThreadStorage().readMemory(await requireThreadStorage(data.threadId))
}

export async function updateThreadMemory({ data }: { data: InferInput<typeof UpdateThreadMemorySchema> }) {
  return createThreadStorage().updateMemory(
    await requireThreadStorage(data.threadId), data.content, data.expectedRevision,
  )
}
