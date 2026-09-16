import { For, Show, createEffect, createSignal } from 'solid-js'
import ArrowUp from 'lucide-solid/icons/arrow-up'
import Download from 'lucide-solid/icons/download'
import PanelRight from 'lucide-solid/icons/panel-right'
import Paperclip from 'lucide-solid/icons/paperclip'
import Search from 'lucide-solid/icons/search'
import { BotAvatar, COLOR_BG } from '../../../../shared/BotAvatar'
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
  onSend?: (text: string) => void
  onOpenRail?: () => void
}

export function Thread(props: ThreadProps) {
  let textareaRef: HTMLTextAreaElement | undefined
  const [draft, setDraft] = createSignal('')
  const members = () => props.members ?? []
  const messages = () => (props.messages ?? []).filter((message) => message.role === 'user' || message.role === 'assistant')

  createEffect(() => {
    props.id
    setDraft('')
    textareaRef?.focus()
  })

  const send = () => {
    const text = draft().trim()
    if (!text || !props.onSend) return
    setDraft('')
    props.onSend(text)
  }

  const insertMention = (member: ThreadMember) => {
    setDraft((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}@${member.name} `)
    textareaRef?.focus()
  }

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
          <p class="mx-auto mb-2 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{props.error}</p>
        </Show>
        <form class="mx-auto w-full max-w-3xl" onSubmit={(event) => { event.preventDefault(); send() }}>
          <Show when={props.group}>
            <div class="mb-2 flex flex-wrap gap-1.5">
              <For each={members()}>
                {(member) => (
                  <button
                    type="button"
                    class={`cursor-pointer rounded-full px-2 py-0.5 text-xs text-stone-600 hover:brightness-95 ${COLOR_BG[member.color]}`}
                    onClick={() => insertMention(member)}
                  >
                    @{member.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows="1"
              value={draft()}
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                  event.preventDefault()
                  send()
                }
              }}
              placeholder={props.group ? 'Message the crew… type @ to mention a bot' : `Message ${props.title ?? 'a bot'}…`}
              class="flex-1 resize-none bg-transparent py-2 text-sm text-stone-600 placeholder-stone-400 focus:outline-none"
            />
            <button type="button" class="cursor-pointer p-2 text-stone-400 hover:text-stone-900" title="Attach">
              <Paperclip class="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={!draft().trim() || !props.onSend}
              class="cursor-pointer flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-white hover:bg-stone-600 disabled:cursor-default disabled:opacity-40"
              title="Send"
            >
              <ArrowUp class="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
