import { EventType, type ModelMessage, type StreamChunk } from '@tanstack/ai'

// Chat loop-guard settings, overridable via .env (server-side only).
// GC_REPLY_DEPTH: max bot-to-bot handoff hops per turn (default 3, §3.5).
// GC_COOLDOWN_MS: minimum gap between user turns in one thread (default 3000).
export const REPLY_DEPTH_CAP = positiveIntEnv('GC_REPLY_DEPTH', 3)
export const COOLDOWN_MS = positiveIntEnv('GC_COOLDOWN_MS', 3000)

export function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export type ChatBot = {
  id: string
  userId: string
  name: string
  modelId: string | null
  soul: string | null
  instructions: string | null
}

export type HistoryMessage = {
  senderType: string
  senderBotId: string | null
  content: string
}

export type ChatThread = {
  name: string
  primaryBotId?: string
  memberIds: string[]
}

export function canResumeRun(run: { userId: string; threadId: string }, userId: string, threadId: string) {
  return run.userId === userId && run.threadId === threadId
}

export function mentionedBots(text: string, roster: readonly ChatBot[]): ChatBot[] {
  const candidates = roster.filter((bot) => bot.name.trim()).map((bot) => ({
    bot,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_@.+-])@${bot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}\\p{M}_@+-]|\\.[\\p{L}\\p{N}])`, 'giu'),
  }))
  const matches = candidates.flatMap(({ bot, pattern }) =>
    [...text.matchAll(pattern)].map((match) => ({ bot, at: match.index, end: match.index + match[0].length })),
  ).sort((a, b) => a.at - b.at || b.end - a.end)
  const seen = new Set<string>()
  const result: ChatBot[] = []
  let end = -1
  for (const match of matches) {
    if (match.at < end) continue
    end = match.end
    if (seen.has(match.bot.id)) continue
    seen.add(match.bot.id)
    result.push(match.bot)
  }
  return result
}

export function systemPromptsFor(speaker: ChatBot, thread: ChatThread, roster: readonly ChatBot[]): string[] {
  const available = roster.filter((bot) => bot.userId === speaker.userId)
  return [
    `You are ${speaker.name}, a bot in Ground Control. Your bot ID is ${speaker.id}. Speak only as yourself, never impersonate the user or another bot.`,
    thread.primaryBotId
      ? `This is the direct thread "${thread.name}". Its primary bot responds first; you may also be responding to a handoff.`
      : `This is the group chat "${thread.name}". Explicit @mentions take priority. Without a group-member mention, members are invited in random order: the first must answer, and later members should usually stay quiet unless they have something genuinely useful to add. Other available bots may join via handoffs.`,
    `SOUL:\n${speaker.soul?.trim() || 'No SOUL configured.'}`,
    `Instructions:\n${speaker.instructions?.trim() || 'No additional instructions configured.'}`,
    `Available bots owned by this user:\n${available.map((bot) => `- @${bot.name} (bot ID: ${bot.id})${bot.id === speaker.id ? ' — you' : ''}${bot.modelId ? '' : ' — no model assigned; cannot reply'}`).join('\n')}`,
    `To request help or hand off in any thread, @mention an available bot by its exact name in your reply and include the context and request for that bot. Do not invent available bots. Each bot answers at most once per turn, with handoffs limited to depth ${REPLY_DEPTH_CAP}. Keep replies in character and reasonably concise.`,
  ]
}

export function contextFor(speakerBotId: string, history: readonly HistoryMessage[], senderNames: ReadonlyMap<string, string>): ModelMessage[] {
  return history.map((row) => {
    if (row.senderType === 'user') return { role: 'user', content: `User: ${row.content}` }
    if (row.senderBotId === speakerBotId) return { role: 'assistant', content: row.content }
    const name = row.senderBotId ? senderNames.get(row.senderBotId) ?? 'Unknown' : 'Unknown'
    return { role: 'user', content: `${name}: ${row.content}` }
  })
}

export async function runReplyChain(options: {
  userId: string
  roster: readonly ChatBot[]
  thread: ChatThread
  text: string
  history: readonly HistoryMessage[]
  random?: () => number
  generate: (speaker: ChatBot, messages: ModelMessage[], systemPrompts: string[], optional: boolean, buffer: boolean) => Promise<string>
}) {
  const roster = options.roster.filter((bot) => bot.userId === options.userId)
  const primary = roster.find((bot) => bot.id === options.thread.primaryBotId)
  const initial = options.thread.primaryBotId
    ? primary ? [primary] : []
    : mentionedBots(options.text, roster.filter((bot) => options.thread.memberIds.includes(bot.id)))
  const openFloor = !options.thread.primaryBotId && mentionedBots(options.text, roster).length === 0
  if (openFloor) {
    const members = roster.filter((bot) => bot.modelId && options.thread.memberIds.includes(bot.id))
    for (let index = members.length - 1; index > 0; index--) {
      const target = Math.floor((options.random ?? Math.random)() * (index + 1))
      ;[members[index], members[target]] = [members[target], members[index]]
    }
    initial.push(...members)
    if (!initial.length) throw new Error('No group member has a model assigned.')
  }
  const queue = initial.map((bot) => ({ bot, depth: 1, invited: openFloor }))
  let hasReply = false
  const answered = new Set<string>()
  const history = [...options.history]
  const senderNames = new Map(roster.map((bot) => [bot.id, bot.name]))
  while (queue.length) {
    const { bot: speaker, depth, invited } = queue.shift()!
    if (answered.has(speaker.id)) continue
    answered.add(speaker.id)
    if (!speaker.modelId) continue
    const optional = invited && hasReply
    const buffer = optional || invited
    const prompts = systemPromptsFor(speaker, options.thread, roster)
    if (invited) prompts.push(optional
      ? 'You are an optional contributor. Read the replies already given this turn. Prefer silence: respond only with a substantive new insight, correction, or necessary question. Do not repeat, agree, acknowledge, or add filler. If you have nothing useful to add, output exactly [[PASS]] and nothing else.'
      : 'You are the first responder for this untagged message. You must provide a helpful, natural reply even without an @mention. Do not pass or remain silent.')
    const reply = (await options.generate(
      speaker,
      contextFor(speaker.id, history, senderNames).slice(-50),
      prompts,
      optional,
      buffer,
    )).replace(/\[\[PASS\]\]/gi, '').trim()
    if (reply.trim()) {
      hasReply = true
      history.push({ senderType: 'bot', senderBotId: speaker.id, content: reply })
      senderNames.set(speaker.id, speaker.name)
    }
    if (depth >= REPLY_DEPTH_CAP) continue
    for (const next of mentionedBots(reply, roster)) {
      const queued = queue.find((entry) => entry.bot.id === next.id)
      if (queued) queued.invited = false
      if (!answered.has(next.id) && !queued) {
        queue.push({ bot: next, depth: depth + 1, invited: false })
      }
    }
  }
}

export function speakerMetadata(speaker: { id: string; name: string }) {
  return { senderBotId: speaker.id, name: speaker.name }
}

export async function streamSpeakerReply(options: {
  speaker: ChatBot
  source: AsyncIterable<StreamChunk>
  emit: (chunks: StreamChunk[]) => Promise<unknown>
  persist: (message: { id: string; content: string }) => Promise<unknown>
  messageId?: () => string
  buffer?: boolean
}): Promise<string> {
  const texts = new Map<string, { id: string; content: string; done: boolean }>()
  const metadata = speakerMetadata(options.speaker)
  const announce = async (message: { id: string; content: string }) => {
    await options.emit([
      {
        type: EventType.CUSTOM,
        name: 'speaker',
        value: { messageId: message.id, botId: options.speaker.id, ...metadata },
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: message.id,
        role: 'assistant' as const,
        name: options.speaker.name,
        metadata,
      },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: message.id, delta: message.content },
      { type: EventType.TEXT_MESSAGE_END, messageId: message.id },
    ])
  }
  for await (const chunk of options.source) {
    if (chunk.type === EventType.RUN_STARTED || chunk.type === EventType.RUN_FINISHED) continue
    if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message)
    if (chunk.type === EventType.TEXT_MESSAGE_START || chunk.type === EventType.TEXT_MESSAGE_CONTENT || chunk.type === EventType.TEXT_MESSAGE_END) {
      let message = texts.get(chunk.messageId)
      if (!message) {
        message = { id: options.messageId?.() ?? crypto.randomUUID(), content: '', done: false }
        texts.set(chunk.messageId, message)
        if (!options.buffer) {
          await options.emit([
            {
              type: EventType.CUSTOM,
              name: 'speaker',
              value: { messageId: message.id, botId: options.speaker.id, ...metadata },
            },
            {
              type: EventType.TEXT_MESSAGE_START,
              messageId: message.id,
              role: 'assistant' as const,
              name: options.speaker.name,
              metadata,
            },
          ])
        }
      }
      if (chunk.type === EventType.TEXT_MESSAGE_START) continue
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) message.content += chunk.delta
      if (chunk.type === EventType.TEXT_MESSAGE_END) message.done = true
      if (!options.buffer) {
        await options.emit([{ ...chunk, messageId: message.id, metadata }])
      }
    } else {
      await options.emit([chunk])
    }
  }
  for (const message of texts.values()) {
    const content = message.content.replace(/\[\[PASS\]\]/gi, '').trim()
    if (content) {
      if (options.buffer) await announce({ id: message.id, content })
      await options.persist({ id: message.id, content })
    }
  }
  return [...texts.values()]
    .map((message) => message.content.replace(/\[\[PASS\]\]/gi, '').trim())
    .filter(Boolean)
    .join('\n\n')
}
