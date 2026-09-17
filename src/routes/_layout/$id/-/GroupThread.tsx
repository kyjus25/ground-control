import { createSignal } from 'solid-js'
import { useChat } from '@tanstack/ai-solid'
import type { ChatMember, GroupChat } from '../../../../server/chats'
import { Thread } from './Thread'
import { createThreadCommands, createThreadConnection } from './thread-commands'
import { replyingSpeaker } from './speaker-state'

export function GroupThread(props: {
  chat: GroupChat
  roster: ChatMember[]
  history: Array<{ senderType: 'user' | 'bot'; senderBotId: string | null; content: string }>
  onOpenRail?: () => void
}) {
  const [speaker, setSpeaker] = createSignal<ChatMember | null>(null)
  const memberById = () => new Map(props.roster.map((member) => [member.id, member]))
  const memberByName = () => new Map(props.roster.map((member) => [member.name.toLowerCase(), member]))

  const transport = createThreadConnection()
  const chat = useChat({
    connection: transport.connection,
    threadId: props.chat.id,
    persistence: true,
    initialMessages: props.history.map((message, index) => ({
      id: `history-${index}`,
      role: message.senderType === 'user' ? ('user' as const) : ('assistant' as const),
      name: memberById().get(message.senderBotId ?? '')?.name,
      metadata: { senderBotId: message.senderBotId },
      parts: [{ type: 'text' as const, content: message.content }],
    })),
    onChunk: (chunk) => setSpeaker((current) => replyingSpeaker(current, chunk, props.roster)),
    onFinish: () => setSpeaker(null),
    onError: () => setSpeaker(null),
  })

  const senderFor = (message: { role: string; name?: string; metadata?: Record<string, unknown> }): ChatMember | null => {
    if (message.role !== 'assistant') return null
    const id = message.metadata?.senderBotId
    const name = message.metadata?.name ?? message.name
    return (typeof id === 'string' ? memberById().get(id) : undefined)
      ?? (typeof name === 'string' ? memberByName().get(name.toLowerCase()) : undefined)
      ?? null
  }

  const commands = createThreadCommands({
    threadId: props.chat.id,
    isLoading: chat.isLoading,
    clear: () => { transport.invalidate(); chat.clear() },
    sendMessage: chat.sendMessage,
    beforeSend: () => setSpeaker(null),
  })

  return (
    <Thread
      id={props.chat.id}
      title={props.chat.name}
      members={props.chat.members}
      mentionableBots={props.roster}
      group
      messages={chat.messages().map((message) => ({
        id: message.id,
        role: message.role,
        text: message.parts.filter((part) => part.type === 'text').map((part) => part.content).join(''),
        sender: senderFor(message),
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
