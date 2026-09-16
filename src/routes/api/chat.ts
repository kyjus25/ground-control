import { createFileRoute } from '@tanstack/solid-router'
import {
  chat,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
  EventType,
  type StreamChunk,
} from '@tanstack/ai'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../../server/db'
import { bots, chatMembers, groupChats, messages, runs } from '../../server/db/schema'
import { getSessionUser } from '../../server/auth'
import { adapterFor } from '../../server/ai'
import { pgStream } from '../../server/durability'
import { canResumeRun, runReplyChain, streamSpeakerReply, type ChatThread } from '../../server/chat-helpers'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getSessionUser()
        if (!user) return new Response('Unauthorized', { status: 401 })
        const userId = user.id
        const body = await request.json().catch(() => null)
        const threadId: unknown = body?.forwardedProps?.botId ?? body?.data?.botId ?? body?.threadId
        if (typeof threadId !== 'string' || !threadId) {
          return new Response('threadId is required', { status: 400 })
        }

        const runId = request.headers.get('X-Run-Id') ?? crypto.randomUUID()
        const lastDelivered = request.headers.get('Last-Event-ID')
        const [knownRun] = await db
          .select({ id: runs.id, userId: runs.userId, threadId: runs.threadId })
          .from(runs)
          .where(eq(runs.id, runId))
        if (knownRun) {
          if (!canResumeRun(knownRun, userId, threadId)) {
            return new Response('Run not found', { status: 404 })
          }
          return resumeServerSentEventsResponse({
            adapter: pgStream({ runId, offset: lastDelivered ?? '-1' }),
          })
        }
        if (!process.env.ZAI_API_KEY) {
          return new Response('ZAI_API_KEY is not set — add your key to .env.local', { status: 500 })
        }

        const roster = await db
          .select({
            id: bots.id,
            userId: bots.userId,
            name: bots.name,
            modelId: bots.modelId,
            soul: bots.soul,
            instructions: bots.instructions,
          })
          .from(bots)
          .where(eq(bots.userId, userId))
        const bot = roster.find((entry) => entry.id === threadId)
        let thread: ChatThread
        if (bot) {
          thread = { name: bot.name, primaryBotId: bot.id, memberIds: [bot.id] }
        } else {
          const [groupChat] = await db
            .select({ id: groupChats.id, name: groupChats.name })
            .from(groupChats)
            .where(and(eq(groupChats.id, threadId), eq(groupChats.userId, userId)))
          if (!groupChat) return new Response('Thread not found', { status: 404 })
          const members = await db
            .select({ id: bots.id })
            .from(chatMembers)
            .innerJoin(bots, eq(chatMembers.botId, bots.id))
            .where(and(eq(chatMembers.chatId, groupChat.id), eq(bots.userId, userId)))
          thread = { name: groupChat.name, memberIds: members.map((member) => member.id) }
        }

        const wireMessages: Array<{ role?: string; content?: unknown }> = Array.isArray(body?.messages)
          ? body.messages
          : []
        const lastUser = [...wireMessages].reverse().find((m) => m?.role === 'user')
        const newText = textOf(lastUser?.content)
        if (!newText.trim()) return new Response('No user message', { status: 400 })

        const registered = await db.transaction(async (tx) => {
          const inserted = await tx.insert(runs)
            .values({ id: runId, userId, threadId, open: true })
            .onConflictDoNothing()
            .returning({ id: runs.id })
          if (!inserted.length) return false
          await tx.insert(messages).values({ userId, threadId, senderType: 'user', content: newText })
          return true
        })
        if (!registered) return new Response('Run already exists; retry to resume', { status: 409 })

        const durability = pgStream({ runId, offset: lastDelivered })
        void (async () => {
          try {
            const history = await db
              .select({
                senderType: messages.senderType,
                senderBotId: messages.senderBotId,
                content: messages.content,
              })
              .from(messages)
              .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId)))
              .orderBy(asc(messages.createdAt))
            await durability.append([{ type: EventType.RUN_STARTED, threadId, runId }])
            await runReplyChain({
              userId,
              roster,
              thread,
              text: newText,
              history,
              generate: (speaker, context, systemPrompts, _optional, buffer) => streamSpeakerReply({
                speaker,
                source: chat({
                  adapter: adapterFor(speaker.modelId!),
                  messages: context,
                  systemPrompts,
                  stream: true,
                }),
                emit: (chunks) => durability.append(chunks),
                persist: (message) => db.insert(messages).values({
                  id: message.id,
                  userId,
                  threadId,
                  senderType: 'bot',
                  senderBotId: speaker.id,
                  content: message.content,
                }),
                buffer,
              }),
            })
            await durability.append([{ type: EventType.RUN_FINISHED, threadId, runId }])
          } catch (err) {
            console.error('[chat] run failed:', runId, err)
            await durability.append([{
              type: EventType.RUN_ERROR,
              message: err instanceof Error ? err.message : 'Run failed',
              code: 'run_failed',
            }])
          } finally {
            await durability.close()
          }
        })()

        async function* logTail(): AsyncIterable<StreamChunk> {
          for await (const { chunk } of durability.read('-1', request.signal)) {
            yield chunk
          }
        }
        return toServerSentEventsResponse(logTail())
      },

      GET: async ({ request }) => {
        const user = await getSessionUser()
        if (!user) return new Response('Unauthorized', { status: 401 })
        const userId = user.id
        const url = new URL(request.url)
        const runId = url.searchParams.get('runId')
        if (runId) {
          const [run] = await db
            .select({ id: runs.id })
            .from(runs)
            .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
          if (!run) return new Response('Run not found', { status: 404 })
          const offset = url.searchParams.get('offset') ?? request.headers.get('Last-Event-ID') ?? '-1'
          return resumeServerSentEventsResponse({ adapter: pgStream({ runId: run.id, offset }) })
        }

        const threadId = url.searchParams.get('threadId')
        if (threadId) {
          const transcript = await db
            .select({
              id: messages.id,
              senderType: messages.senderType,
              senderBotId: messages.senderBotId,
              content: messages.content,
              createdAt: messages.createdAt,
              botName: bots.name,
            })
            .from(messages)
            .leftJoin(bots, and(eq(messages.senderBotId, bots.id), eq(bots.userId, userId)))
            .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId)))
            .orderBy(asc(messages.createdAt))
          const [liveRun] = await db
            .select({ id: runs.id })
            .from(runs)
            .where(and(eq(runs.userId, userId), eq(runs.threadId, threadId), eq(runs.open, true)))
            .orderBy(desc(runs.createdAt))
            .limit(1)
          return Response.json({
            messages: transcript.map((m) => ({
              id: m.id,
              role: m.senderType === 'user' ? ('user' as const) : ('assistant' as const),
              name: m.botName ?? undefined,
              senderBotId: m.senderBotId ?? undefined,
              metadata: m.senderBotId ? { senderBotId: m.senderBotId, name: m.botName ?? undefined } : undefined,
              createdAt: m.createdAt,
              parts: [{ type: 'text', content: m.content }],
            })),
            activeRun: liveRun ? { runId: liveRun.id } : null,
          })
        }
        return new Response('threadId or runId is required', { status: 400 })
      },
    },
  },
})

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p) => (p as { type?: string })?.type === 'text')
      .map((p) => String((p as { text?: string }).text ?? ''))
      .join('')
  }
  return ''
}
