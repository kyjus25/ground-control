import type { MetadataStore } from '@tanstack/ai'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { compactionMetadata } from './db/schema'
import type { ThreadTransaction } from './thread-guard'

export function threadMetadata(userId: string, threadId: string, scope: string, connection: ThreadTransaction | typeof db = db): MetadataStore {
  const identity = (namespace: string, key: string) => and(
    eq(compactionMetadata.userId, userId),
    eq(compactionMetadata.threadId, threadId),
    eq(compactionMetadata.scope, scope),
    eq(compactionMetadata.namespace, namespace),
    eq(compactionMetadata.key, key),
  )
  return {
    async get(namespace, key) {
      const [row] = await connection.select({ value: compactionMetadata.value }).from(compactionMetadata)
        .where(identity(namespace, key))
      return row?.value ?? null
    },
    async set(namespace, key, value) {
      await connection.insert(compactionMetadata).values({ userId, threadId, scope, namespace, key, value })
        .onConflictDoUpdate({
          target: [compactionMetadata.userId, compactionMetadata.threadId, compactionMetadata.scope, compactionMetadata.namespace, compactionMetadata.key],
          set: { value },
        })
    },
    async delete(namespace, key) {
      await connection.delete(compactionMetadata).where(identity(namespace, key))
    },
  }
}
