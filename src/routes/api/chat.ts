import { createFileRoute } from '@tanstack/solid-router'
import { chat } from '@tanstack/ai'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../../server/db'
import { bots, messages, runs } from '../../server/db/schema'
import { getSessionUser } from '../../server/auth'
import { adapterFor } from '../../server/model-adapter'
import { pgStream } from '../../server/durability'
import { durableChatResponse, produceChatRun } from '../../server/chat-stream'
import { canResumeRun, COOLDOWN_MS, runReplyChain, streamSpeakerReply } from '../../server/chat-helpers'
import { lockIdleThread, ownedThread, ThreadError } from '../../server/thread-guard'
import { summarizeWith, threadHistory } from '../../server/chat-context'
import { compactionMiddleware, compactionSettings } from '../../server/compaction'
import { threadMetadata } from '../../server/compaction-store'
import { createSpeakerStorage } from '../../server/speaker-storage'

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
          return durableChatResponse(pgStream({ runId, offset: lastDelivered ?? '-1' }), request.signal)
        }
        if (lastDelivered !== null) return new Response('Run not found', { status: 404 })
        if (!process.env.ZAI_API_KEY) {
          return new Response('ZAI_API_KEY is not set — add your key to .env.local', { status: 500 })
        }

        const wireMessages: Array<{ role?: string; content?: unknown }> = Array.isArray(body?.messages)
          ? body.messages
          : []
        const lastUser = [...wireMessages].reverse().find((m) => m?.role === 'user')
        const newText = textOf(lastUser?.content)
        if (!newText.trim()) return new Response('No user message', { status: 400 })

        const registration = await db.transaction(async (tx) => {
          const owned = await ownedThread(tx, userId, threadId)
          await lockIdleThread(tx, userId, threadId)
          const [lastUserMessage] = await tx.select({ createdAt: messages.createdAt }).from(messages)
            .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId), eq(messages.senderType, 'user')))
            .orderBy(desc(messages.createdAt)).limit(1)
          if (lastUserMessage && Date.now() - lastUserMessage.createdAt.getTime() < COOLDOWN_MS) {
            throw new ThreadError('This thread is cooling down. Try again shortly.', 429)
          }
          const inserted = await tx.insert(runs)
            .values({ id: runId, userId, threadId, open: true })
            .onConflictDoNothing()
            .returning({ id: runs.id })
          if (!inserted.length) throw new ThreadError('Run already exists; retry to resume', 409)
          await tx.insert(messages).values({ userId, threadId, senderType: 'user', content: newText })
          return owned
        }).catch((error: unknown) => {
          if (error instanceof ThreadError) return Response.json({ error: error.message }, { status: error.status })
          throw error
        })
        if (registration instanceof Response) return registration
        const { roster, thread } = registration

        const durability = pgStream({ runId, offset: '-1' })
        void produceChatRun({
          adapter: durability,
          runId,
          threadId,
          report: (phase, error) => console.error('[chat] run failed:', runId, phase, error instanceof Error ? error.stack?.split('\n').filter((line) => /^\s+at /.test(line)).join('\n') : 'Unknown error'),
          produce: async () => {
            const { history } = await threadHistory(userId, threadId)
            await runReplyChain({
              userId,
              roster,
              thread,
              text: newText,
              history,
              generate: async (speaker, context, systemPrompts, _optional, buffer) => {
                return streamSpeakerReply({
                  speaker,
                  source: async () => {
                    const storage = await createSpeakerStorage({ userId, botId: speaker.id, threadId })
                    return chat({
                    adapter: adapterFor(speaker.modelId!),
                    threadId,
                    middleware: compactionMiddleware(
                      compactionSettings(),
                      threadMetadata(userId, threadId, speaker.id),
                      summarizeWith(speaker.modelId!),
                      true,
                    ),
                    messages: context,
                    systemPrompts: [...systemPrompts, ...storage.systemPrompts],
                    tools: storage.tools,
                    agentLoopStrategy: storage.agentLoopStrategy,
                    stream: true,
                    })
                  },
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
                })
              },
            })
          },
        })
        return durableChatResponse(durability, request.signal)
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
          return durableChatResponse(pgStream({ runId: run.id, offset }), request.signal)
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
