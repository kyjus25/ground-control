import { For, Show } from 'solid-js'
import Download from 'lucide-solid/icons/download'
import PanelRight from 'lucide-solid/icons/panel-right'
import Search from 'lucide-solid/icons/search'
import { BotAvatar } from '../../../../shared/BotAvatar'
import { Composer } from './Composer'
import type { ChatCommand } from './composer-model'
import { formatTime } from '../../../../shared/format'
import type { Bot } from '../../../../types/bot'
import { MessageContent } from './MentionText'

export type ThreadMember = Pick<Bot, 'id' | 'name' | 'emoji' | 'color' | 'shape'>
export type ThreadMessage = {
  id: string
  role: string
  text: string
  sender?: ThreadMember | null
  createdAt?: Date | string
}

type ThreadProps = {
  id?: string
  title?: string
  members?: readonly ThreadMember[]
  mentionableBots?: readonly ThreadMember[]
  messages?: readonly ThreadMessage[]
  group?: boolean
  loading?: boolean
  speaker?: ThreadMember | null
  error?: string
  notice?: string
  busy?: boolean
  onCommand?: (command: ChatCommand) => Promise<boolean>
  onSend?: (text: string) => void
  onOpenRail?: () => void
}

export function Thread(props: ThreadProps) {
  const members = () => props.members ?? []
  const messages = () => (props.messages ?? []).filter((message) => message.role === 'user' || message.role === 'assistant')

  return (
    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-4 sm:px-6">
        <div class="-space-x-1.5 flex items-center">
          <For each={members().slice(0, 3)}>
            {(member) => <BotAvatar bot={member} class="h-7 w-7 text-xs ring-2 ring-stone-100" />}
          </For>
        </div>
        <h1 class="text-[15px] font-medium">{props.title ?? 'Thread'}</h1>
        <div class="ml-auto flex items-center gap-1 text-stone-400">
          <button
            type="button"
            class="cursor-pointer rounded-lg p-2 hover:bg-stone-200 hover:text-stone-900 lg:hidden"
            title="Thread panel"
            onClick={() => props.onOpenRail?.()}
          >
            <PanelRight class="h-4 w-4" />
          </button>
          <button type="button" class="cursor-pointer rounded-lg p-2 hover:bg-stone-200 hover:text-stone-900" title="Search">
            <Search class="h-4 w-4" />
          </button>
          <Show when={!props.group}>
            <button type="button" class="hidden cursor-pointer rounded-lg p-2 hover:bg-stone-200 hover:text-stone-900 sm:block" title="Export">
              <Download class="h-4 w-4" />
            </button>
          </Show>
        </div>
      </header>

      <div class="flex-1 space-y-7 overflow-y-auto px-4 py-8 [scrollbar-gutter:stable] sm:px-8">
        <Show when={messages().length > 0} fallback={
          <div class="mx-auto mt-24 max-w-sm text-center">
            <div class="flex justify-center -space-x-2">
              <For each={members().slice(0, 3)}>
                {(member) => <BotAvatar bot={member} class={props.group ? 'h-10 w-10 text-base ring-2 ring-white' : 'h-14 w-14 text-2xl'} />}
              </For>
            </div>
            <p class="mt-3 text-sm font-medium">{props.title ?? 'Thread unavailable'}</p>
            <p class="mt-1 text-xs leading-relaxed text-stone-400">
              {props.group
                ? `Mention a member with @${members()[0]?.name ?? 'name'} to get the conversation going.`
                : props.onSend ? 'Say hi to start the conversation — replies stream in live.' : 'Select a bot or group chat to start a conversation.'}
            </p>
          </div>
        }>
          <For each={messages()}>
            {(message) => (
              <div class="mx-auto flex w-full max-w-3xl gap-3">
                <Show when={message.role === 'assistant' && message.sender} fallback={
                  <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[11px] font-medium text-stone-600">
                    {message.role === 'user' ? 'You' : 'Bot'}
                  </div>
                } keyed>
                  {(sender) => <BotAvatar bot={sender} class="mt-0.5 h-7 w-7 text-xs" />}
                </Show>
                <div class="min-w-0">
                  <div class="mb-0.5 flex items-baseline gap-2">
                    <span class="text-[13px] font-medium">{message.role === 'user' ? 'You' : message.sender?.name ?? 'Assistant'}</span>
                    <Show when={formatTime(message.createdAt)}>
                      <span class="text-xs text-stone-400">{formatTime(message.createdAt)}</span>
                    </Show>
                  </div>
                  <div class={message.role === 'user'
                    ? 'whitespace-pre-wrap text-sm leading-relaxed text-stone-600'
                    : 'text-sm leading-relaxed text-stone-600 [&_ol]:list-inside [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:leading-relaxed [&_ul]:list-inside [&_ul]:list-disc [&_ul]:space-y-1'}>
                    <MessageContent text={message.text} members={props.mentionableBots ?? members()} markdown={message.role === 'assistant'} />
                  </div>
                </div>
              </div>
            )}
          </For>
        </Show>
        <Show when={props.loading}>
          <div class="mx-auto flex w-full max-w-3xl items-center gap-3">
            <Show when={props.speaker} fallback={<div class="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs">Bot</div>} keyed>
              {(speaker) => <BotAvatar bot={speaker} class="h-7 w-7 text-xs" />}
            </Show>
            <div class="flex items-center gap-2 text-[13px] text-stone-400">
              <span>{props.speaker?.name ?? 'The crew'} is writing</span>
              <span class="typing-dot h-1 w-1 rounded-full bg-stone-400" />
              <span class="typing-dot h-1 w-1 rounded-full bg-stone-400" />
              <span class="typing-dot h-1 w-1 rounded-full bg-stone-400" />
            </div>
          </div>
        </Show>
      </div>

      <div class="shrink-0 border-t border-stone-200 p-4">
        <Show when={props.error}>
          <p role="alert" class="mx-auto mb-2 max-w-3xl rounded-lg border border-stone-300 bg-stone-100 px-3 py-2 text-xs text-stone-700">{props.error}</p>
        </Show>
        <Show when={props.notice}>
          <p role="status" class="mx-auto mb-2 max-w-3xl rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-xs text-stone-600">{props.notice}</p>
        </Show>
        <Composer
          id={props.id}
          title={props.title}
          group={props.group}
          members={members()}
          mentionableBots={props.mentionableBots ?? members()}
          busy={props.busy || props.loading}
          onSend={props.onSend}
          onCommand={props.onCommand}
        />
      </div>
    </main>
  )
}
