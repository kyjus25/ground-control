import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { bots, chatMembers, compactionMetadata, groupChats, messages, runEvents, runs, users } from './db/schema'
import { threadMetadata } from './compaction-store'
import { executeChatCommand } from './chat-commands'
import { threadHistory } from './chat-context'
import { lockIdleThread, ThreadError } from './thread-guard'

const enabled = process.env.GC_TEST_DB === 'true'

describe.skipIf(!enabled)('chat commands with Postgres', () => {
  const userId = crypto.randomUUID()
  const foreignId = crypto.randomUUID()
  const threadId = crypto.randomUUID()
  const runId = crypto.randomUUID()
  const originalType = process.env.GC_COMPACTION_TYPE

  beforeAll(async () => {
    process.env.GC_COMPACTION_TYPE = 'evict-oldest'
    await db.insert(users).values([
      { id: userId, email: `${userId}@test.invalid`, passwordHash: 'test-only' },
      { id: foreignId, email: `${foreignId}@test.invalid`, passwordHash: 'test-only' },
    ])
    await db.insert(bots).values({ id: threadId, userId, name: 'Command test' })
    await db.insert(messages).values(Array.from({ length: 12 }, (_, index) => ({
      userId, threadId, senderType: 'user' as const, content: `Message ${index}: ${'context '.repeat(100)}`,
      createdAt: new Date(Date.now() - 60000 + index * 1000),
    })))
    await db.insert(runs).values({ id: runId, userId, threadId, open: false })
    await db.insert(runEvents).values({ runId, chunk: { type: 'RUN_FINISHED' } })
  })

  afterAll(async () => {
    if (originalType === undefined) delete process.env.GC_COMPACTION_TYPE
    else process.env.GC_COMPACTION_TYPE = originalType
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(users).where(eq(users.id, foreignId))
  })

  test('authentication, validation, and ownership fail without changes', async () => {
    expect((await executeChatCommand(null, { threadId, command: 'clear' })).status).toBe(401)
    expect((await executeChatCommand(userId, { threadId: 'bad', command: 'clear' })).status).toBe(400)
    expect((await executeChatCommand(userId, { threadId, command: 'other' })).status).toBe(400)
    expect((await executeChatCommand(foreignId, { threadId, command: 'clear' })).status).toBe(404)
    expect((await threadHistory(userId, threadId)).history).toHaveLength(12)
  })

  test('manual context persists across reads without altering transcript and accepts new messages', async () => {
    const response = await executeChatCommand(userId, { threadId, command: 'compact' })
    expect(response.status).toBe(200)
    expect((await response.json()).message).toContain('Context compacted')
    const first = await threadHistory(userId, threadId)
    expect(first.history.length).toBeLessThan(12)
    expect(first.history[0]!.senderType).toBe('summary')
    expect((await threadHistory(userId, threadId)).history).toEqual(first.history)
    const transcript = await db.select().from(messages).where(eq(messages.threadId, threadId))
    expect(transcript).toHaveLength(12)
    await db.insert(messages).values({ userId, threadId, senderType: 'user', content: 'Continue after compaction' })
    const second = await threadHistory(userId, threadId)
    expect(second.history.slice(0, -1)).toEqual(first.history)
    expect(second.history.at(-1)!.content).toBe('Continue after compaction')
  })

  test('active runs and shared advisory locks reject both commands', async () => {
    await db.update(runs).set({ open: true }).where(eq(runs.id, runId))
    for (const command of ['compact', 'clear']) {
      expect((await executeChatCommand(userId, { threadId, command })).status).toBe(409)
    }
    await db.update(runs).set({ open: false }).where(eq(runs.id, runId))
    await db.transaction(async (tx) => {
      await lockIdleThread(tx, userId, threadId)
      expect((await executeChatCommand(userId, { threadId, command: 'clear' })).status).toBe(409)
      await expect(db.transaction((other) => lockIdleThread(other, userId, threadId))).rejects.toBeInstanceOf(ThreadError)
    })
  })

  test('group commands remain owned and metadata scopes remain isolated', async () => {
    const groupId = crypto.randomUUID()
    await db.insert(groupChats).values({ id: groupId, userId, name: 'Command group' })
    await db.insert(chatMembers).values({ chatId: groupId, botId: threadId })
    await db.insert(messages).values(Array.from({ length: 8 }, (_, index) => ({
      userId, threadId: groupId, senderType: 'bot' as const, senderBotId: threadId,
      content: `Bot context ${index} ${'details '.repeat(100)}`, createdAt: new Date(Date.now() - 10000 + index * 1000),
    })))
    const store = threadMetadata(userId, groupId, threadId)
    await store.set('@tanstack/ai-compaction', groupId, { checkpoint: 'test' })
    expect(await threadMetadata(userId, groupId, 'another-bot').get('@tanstack/ai-compaction', groupId)).toBeNull()
    expect(await threadMetadata(foreignId, groupId, threadId).get('@tanstack/ai-compaction', groupId)).toBeNull()
    expect((await executeChatCommand(foreignId, { threadId: groupId, command: 'compact' })).status).toBe(404)
    expect((await executeChatCommand(userId, { threadId: groupId, command: 'compact' })).status).toBe(200)
    expect((await threadHistory(userId, groupId)).history.length).toBeLessThan(8)
    expect(await store.get('@tanstack/ai-compaction', groupId)).toBeNull()
    expect((await executeChatCommand(userId, { threadId: groupId, command: 'clear' })).status).toBe(200)
    expect((await threadHistory(userId, groupId)).history).toEqual([])
  })

  test('clear deletes transcript, checkpoints, runs and replay events atomically', async () => {
    const response = await executeChatCommand(userId, { threadId, command: 'clear' })
    expect(response.status).toBe(200)
    expect((await response.json()).message).toContain('Chat cleared')
    expect((await threadHistory(userId, threadId)).history).toEqual([])
    expect(await db.select().from(compactionMetadata).where(and(eq(compactionMetadata.userId, userId), eq(compactionMetadata.threadId, threadId)))).toEqual([])
    expect(await db.select().from(runs).where(eq(runs.id, runId))).toEqual([])
    expect(await db.select().from(runEvents).where(eq(runEvents.runId, runId))).toEqual([])
    expect((await executeChatCommand(userId, { threadId, command: 'clear' })).status).toBe(200)
    expect((await (await executeChatCommand(userId, { threadId, command: 'compact' })).json()).message).toContain('Not enough history')
  })
})
