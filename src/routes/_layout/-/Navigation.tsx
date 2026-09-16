import { For, Show, Suspense, lazy, createSignal, createMemo } from 'solid-js'
import { Link, useNavigate, useParams } from '@tanstack/solid-router'
import { createQuery } from '@tanstack/solid-query'
import Pencil from 'lucide-solid/icons/pencil'
import Plus from 'lucide-solid/icons/plus'
import SatelliteDish from 'lucide-solid/icons/satellite-dish'
import Settings from 'lucide-solid/icons/settings'
import Users from 'lucide-solid/icons/users'
import type { Bot, BotColor, BotShape } from '../../../types/bot'
import { listBots } from '../../../server/bots'
import { listChats } from '../../../server/chats'

const SettingsDialog = lazy(() => import('./SettingsDialog'))
const BotEditorDialog = lazy(() => import('./BotEditorDialog'))

const SHAPE_CLASS: Record<BotShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-md',
  hex: 'shape-hex',
  triangle: 'shape-tri',
  diamond: 'shape-diamond',
}

const COLOR_BG: Record<BotColor, string> = {
  green: 'bg-green-100',
  teal: 'bg-teal-100',
  sky: 'bg-sky-100',
  blue: 'bg-blue-100',
  violet: 'bg-violet-100',
  fuchsia: 'bg-fuchsia-100',
  rose: 'bg-rose-100',
  red: 'bg-red-100',
  orange: 'bg-orange-100',
  amber: 'bg-amber-100',
  lime: 'bg-lime-100',
  stone: 'bg-stone-100',
}

export function Navigation(props: { onNavigate?: () => void } = {}) {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeId = () => params().id

  const botsQuery = createQuery(() => ({ queryKey: ['bots'], queryFn: listBots }))
  const chatsQuery = createQuery(() => ({ queryKey: ['chats'], queryFn: listChats }))
  const botList = () => botsQuery.data ?? []
  const chatList = () => chatsQuery.data ?? []

  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [editorOpen, setEditorOpen] = createSignal(false)
  const [editingBot, setEditingBot] = createSignal<Bot | null>(null)

  // Clicking the already-open workspace deselects it and returns to the dashboard.
  const handleSelect = (id: string, e: MouseEvent) => {
    if (activeId() === id) {
      e.preventDefault()
      navigate({ to: '/' })
    }
    props.onNavigate?.()
  }

  const openEditor = (bot: Bot | null) => {
    setEditingBot(bot)
    setEditorOpen(true)
  }

  const rowClass = (id: string) =>
    `group mb-1 flex items-center gap-3 rounded-lg border px-2.5 py-2 cursor-pointer ${
      activeId() === id
        ? 'border-stone-200 bg-white'
        : 'border-transparent hover:bg-stone-200'
    }`

  // Group bots by category, preserving first-seen order.
  const botGroups = createMemo(() => {
    const map = new Map<string, Bot[]>()
    for (const bot of botList()) {
      const category = bot.category ?? 'Bots'
      if (!map.has(category)) map.set(category, [])
      map.get(category)!.push(bot)
    }
    return [...map.entries()].map(([category, list]) => ({ category, bots: list }))
  })

  const detail = (parts: Array<string | null>) =>
    parts.filter(Boolean).join(' · ')

  return (
    <aside class="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-100">
      <div class="flex h-14 shrink-0 items-center gap-2 px-5">
        <Link
          to="/"
          preload={false}
          class="flex cursor-pointer items-center gap-2 rounded-md"
          title="Dashboard"
          onClick={() => props.onNavigate?.()}
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-900">
            <SatelliteDish class="h-3.5 w-3.5 text-white" />
          </span>
          <span class="text-[15px] font-medium tracking-tight">Ground Control</span>
        </Link>
      </div>

      <div class="flex-1 overflow-y-auto px-3 pb-4">
        {/* Bots section heading — always visible so the add affordance is too */}
        <div class="flex items-center justify-between px-2.5 pt-1 pb-1">
          <span class="text-[13px] text-stone-400">Bots</span>
          <button
            class="cursor-pointer text-stone-400 hover:text-stone-900"
            title="New bot"
            onClick={() => openEditor(null)}
          >
            <Plus class="h-3.5 w-3.5" />
          </button>
        </div>
        <Show
          when={!botsQuery.isPending}
          fallback={
            <div class="space-y-2 px-2.5 pt-2">
              <div class="h-10 animate-pulse rounded-lg bg-stone-200/60" />
              <div class="h-10 animate-pulse rounded-lg bg-stone-200/60" />
            </div>
          }
        >
          <For each={botGroups()}>
            {(group) => (
              <>
                {/* Uncategorized bots are covered by the section heading */}
                <Show when={group.category !== 'Bots'}>
                  <div class="px-2.5 pt-4 pb-1 text-[13px] text-stone-400">
                    {group.category}
                  </div>
                </Show>
                <For each={group.bots}>
                  {(bot) => (
                    <Link
                      to="/$id"
                      params={{ id: bot.id }}
                      preload={false}
                      class={rowClass(bot.id)}
                      onClick={(e) => handleSelect(bot.id, e)}
                    >
                      <div
                        class={`flex h-8 w-8 shrink-0 items-center justify-center text-sm ${SHAPE_CLASS[bot.shape]} ${COLOR_BG[bot.color]}`}
                      >
                        {bot.emoji}
                      </div>
                      <div class="min-w-0">
                        <div class="truncate text-sm font-medium">{bot.name}</div>
                        <div class="truncate text-xs text-stone-400">{detail([bot.modelId])}</div>
                      </div>
                      <button
                        class="ml-auto cursor-pointer rounded-md p-1 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-stone-900"
                        title={`Edit ${bot.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          openEditor(bot)
                        }}
                      >
                        <Pencil class="h-3.5 w-3.5" />
                      </button>
                      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    </Link>
                  )}
                </For>
              </>
            )}
          </For>

          {/* Group chats */}
          <div class="flex items-center justify-between px-2.5 pt-5 pb-1">
            <span class="text-[13px] text-stone-400">Group chats</span>
            <button
              class="cursor-pointer text-stone-400 hover:text-stone-900"
              title="New group chat"
            >
              <Plus class="h-3.5 w-3.5" />
            </button>
          </div>
          <Show
            when={!chatsQuery.isLoading}
            fallback={<div class="h-10 animate-pulse rounded-lg bg-stone-200/60" />}
          >
            <For each={chatList()}>
              {(chat) => (
                <Link
                  to="/$id"
                  params={{ id: chat.id }}
                  preload={false}
                  class={rowClass(chat.id)}
                  onClick={(e) => handleSelect(chat.id, e)}
                >
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200/70">
                    <Users class="h-3.5 w-3.5 text-stone-400" />
                  </div>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium">{chat.name}</div>
                    <div class="truncate text-xs text-stone-400">{chat.membersLabel}</div>
                  </div>
                </Link>
              )}
            </For>
          </Show>
        </Show>
      </div>

      <div class="border-t border-stone-200 p-3">
        <button
          class="mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-stone-600 hover:bg-stone-200"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings class="h-4 w-4 text-stone-400" />
          Settings
        </button>
      </div>

      <Show when={settingsOpen()}>
        <Suspense fallback={null}>
          <SettingsDialog onClose={() => setSettingsOpen(false)} />
        </Suspense>
      </Show>

      <Show when={editorOpen()}>
        <Suspense fallback={null}>
          <BotEditorDialog bot={editingBot()} onClose={() => setEditorOpen(false)} />
        </Suspense>
      </Show>
    </aside>
  )
}
