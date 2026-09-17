import { and, eq } from 'drizzle-orm'
import * as v from 'valibot'
import { chatCommandSchema } from '../types/chat-command-schema'
import { db } from './db'
import { compactionMetadata, messages, runs } from './db/schema'
import { lockIdleThread, ownedThread, ThreadError } from './thread-guard'
import { compactManually, compactionSettings } from './compaction'
import { summarizeWith, threadHistory } from './chat-context'
import { threadMetadata } from './compaction-store'

export async function executeChatCommand(userId: string | null, body: unknown): Promise<Response> {
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = v.safeParse(chatCommandSchema, body)
  if (!parsed.success) return Response.json({ error: 'Expected a valid threadId and command: clear or compact' }, { status: 400 })
  const { threadId, command } = parsed.output
  try {
    const message = await db.transaction(async (tx) => {
      const { roster, thread } = await ownedThread(tx, userId, threadId)
      await lockIdleThread(tx, userId, threadId)
      const stateFilter = and(eq(compactionMetadata.userId, userId), eq(compactionMetadata.threadId, threadId))
      if (command === 'clear') {
        await tx.delete(runs).where(and(eq(runs.userId, userId), eq(runs.threadId, threadId)))
        await tx.delete(messages).where(and(eq(messages.userId, userId), eq(messages.threadId, threadId)))
        await tx.delete(compactionMetadata).where(stateFilter)
        return 'Chat cleared. Messages, compacted context, and saved runs have been deleted.'
      }
      const { history, sourceIds } = await threadHistory(userId, threadId, tx)
      if (history.length < 6) return 'Not enough history to compact. The chat is unchanged.'
      const settings = compactionSettings()
      const speaker = roster.find((bot) => thread.memberIds.includes(bot.id) && bot.modelId)
      if (settings.type !== 'evict-oldest' && !speaker?.modelId) {
        throw new ThreadError('Assign a model to a thread member before compacting', 400)
      }
      const names = new Map(roster.map((bot) => [bot.id, bot.name]))
      const context = history.map((row) => ({
        role: 'user' as const,
        content: row.senderType === 'summary' ? row.content : `${row.senderType === 'user' ? 'User' : names.get(row.senderBotId ?? '') ?? 'Unknown bot'}: ${row.content}`,
      }))
      const compacted = await compactManually(context, settings, summarizeWith(speaker?.modelId ?? ''))
      if (!compacted) return 'Not enough history to compact further. The chat is unchanged.'
      const retainedCount = compacted.length - 1
      const compactedHistory = [
        { senderType: 'summary', senderBotId: null, content: String(compacted[0]!.content) },
        ...history.slice(history.length - retainedCount),
      ]
      await tx.delete(compactionMetadata).where(stateFilter)
      await threadMetadata(userId, threadId, 'manual', tx).set('ground-control', 'history', { sourceIds, history: compactedHistory })
      return 'Context compacted. Recent messages are retained and the displayed transcript is unchanged.'
    })
    return Response.json({ message })
  } catch (error) {
    if (error instanceof ThreadError) return Response.json({ error: error.message }, { status: error.status })
    return Response.json({ error: 'Unable to complete the command. Check the configured model/provider and try again.' }, { status: 500 })
  }
}
