import { createSignal } from 'solid-js'
import { useChat } from '@tanstack/ai-solid'
import type { Bot } from '../../../../types/bot'
import { Thread, type ThreadMember } from './Thread'
import { createThreadCommands, createThreadConnection } from './thread-commands'
import { replyingSpeaker } from './speaker-state'

export function BotThread(props: {
  bot: Bot
  roster: ThreadMember[]
  history: Array<{ senderType: 'user' | 'bot'; senderBotId: string | null; content: string }>
  onOpenRail?: () => void
}) {
  const [speaker, setSpeaker] = createSignal<ThreadMember | null>(props.bot)
  const byId = (id: unknown) => props.roster.find((bot) => bot.id === id)
  const byName = (name: unknown) => typeof name === 'string'
    ? props.roster.find((bot) => bot.name.toLowerCase() === name.toLowerCase())
    : undefined
  const transport = createThreadConnection()
  const chat = useChat({
    connection: transport.connection,
    threadId: props.bot.id,
    persistence: true,
    forwardedProps: { botId: props.bot.id },
    initialMessages: props.history.map((message, index) => ({
      id: `history-${index}`,
      role: message.senderType === 'user' ? ('user' as const) : ('assistant' as const),
      metadata: { senderBotId: message.senderBotId },
      parts: [{ type: 'text' as const, content: message.content }],
    })),
    onChunk: (chunk) => setSpeaker((current) => replyingSpeaker(current, chunk, props.roster)),
    onFinish: () => setSpeaker(null),
    onError: () => setSpeaker(null),
  })

  const commands = createThreadCommands({
    threadId: props.bot.id,
    isLoading: chat.isLoading,
    clear: () => { transport.invalidate(); chat.clear() },
    sendMessage: chat.sendMessage,
    beforeSend: () => setSpeaker(props.bot),
  })

  return (
    <Thread
      id={props.bot.id}
      title={props.bot.name}
      members={[props.bot]}
      mentionableBots={props.roster}
      messages={chat.messages().map((message) => ({
        id: message.id,
        role: message.role,
        text: message.parts.filter((part) => part.type === 'text').map((part) => part.content).join(''),
        sender: message.role === 'assistant'
          ? byId(message.metadata?.senderBotId) ?? byName(message.metadata?.name ?? message.name) ?? null
          : null,
        createdAt: message.createdAt,
      }))}
      loading={chat.isLoading()}
      speaker={speaker()}
      error={commands.error() || chat.error()?.message}
      notice={commands.notice()}
      busy={commands.busy()}
      onSend={commands.send}
      onCommand={commands.command}
      onOpenRail={props.onOpenRail}
    />
  )
}
