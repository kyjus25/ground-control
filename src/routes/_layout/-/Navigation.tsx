import { For, lazy, Suspense, createSignal } from 'solid-js'
import { Link, useNavigate, useParams } from '@tanstack/solid-router'
import { Plus, SatelliteDish, Settings, Users } from 'lucide-solid'
import { Dialog } from '../../../shared/Dialog'
import type { BotGroup } from '../../../types/bot'
import type { GroupChat } from '../../../types/group-chat'

const SettingsContent = lazy(() => import('./SettingsDialog'))

// Placeholder workspace ids until bots/chats are backed by the database (M2).
const botGroups: BotGroup[] = [
  {
    category: 'Research',
    bots: [
      {
        id: '12bfa4cd-c6a8-4f64-b33f-2e331794b1e3',
        name: 'Scout',
        detail: 'gpt-6-mini · atlas',
        emoji: '🧭',
        avatarClass: 'rounded-full bg-green-100',
        dotClass: 'bg-green-500',
      },
      {
        id: 'abbfe51f-86ea-43d7-9ecd-67cb48ea2b5b',
        name: 'Librarian',
        detail: 'glm-5.2 · home',
        emoji: '📚',
        avatarClass: 'shape-hex bg-blue-100',
        dotClass: 'bg-amber-400',
      },
    ],
  },
  {
    category: 'Development',
    bots: [
      {
        id: '2d243481-5693-40c8-854a-e10afc5dc9c3',
        name: 'Blaze',
        detail: 'opus · atlas',
        emoji: '🔥',
        avatarClass: 'rounded-md bg-orange-100',
        dotClass: 'bg-green-500',
      },
    ],
  },
  {
    category: 'Ops',
    bots: [
      {
        id: '7e773e12-b0c7-49ba-bcbe-d17742c20cc0',
        name: 'Fixit',
        detail: 'qwen 122b · home',
        emoji: '🛠️',
        avatarClass: 'shape-tri bg-violet-100',
        dotClass: 'bg-stone-200',
        dimmed: true,
      },
    ],
  },
]

const groupChats: GroupChat[] = [
  {
    id: '6eb115b9-5394-4f8a-ba79-091b2210c8d3',
    name: 'Weekend Project Crew',
    members: 'Scout, Blaze',
  },
  {
    id: '9484460b-b029-4eca-8131-2b89f0f05586',
    name: 'Morning Briefing',
    members: 'Scout',
  },
]

export function Navigation() {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeId = () => params().id
  const [settingsOpen, setSettingsOpen] = createSignal(false)

  // Clicking the already-open workspace deselects it and returns to the dashboard.
  const handleSelect = (id: string, e: MouseEvent) => {
    if (activeId() === id) {
      e.preventDefault()
      navigate({ to: '/' })
    }
  }

  const rowClass = (id: string) =>
    `mb-1 flex items-center gap-3 rounded-lg border px-2.5 py-2 cursor-pointer ${
      activeId() === id
        ? 'border-stone-200 bg-white'
        : 'border-transparent hover:bg-stone-200'
    }`

  return (
    <aside class="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-100">
      <div class="flex h-14 shrink-0 items-center gap-2 px-5">
        <Link to="/" class="flex cursor-pointer items-center gap-2 rounded-md" title="Dashboard">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-900">
            <SatelliteDish class="h-3.5 w-3.5 text-white" />
          </span>
          <span class="text-[15px] font-medium tracking-tight">Ground Control</span>
        </Link>
        <button class="ml-auto cursor-pointer text-stone-400 hover:text-stone-900" title="New bot">
          <Plus class="h-4 w-4" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 pb-4">
        <For each={botGroups}>
          {(group) => (
            <>
              <div class="px-2.5 pt-4 pb-1 text-[13px] text-stone-400 first:pt-0">
                {group.category}
              </div>
              <For each={group.bots}>
                {(bot) => (
                  <Link
                    to="/$id"
                    params={{ id: bot.id }}
                    class={rowClass(bot.id)}
                    onClick={(e) => handleSelect(bot.id, e)}
                  >
                    <div
                      class={`flex h-8 w-8 shrink-0 items-center justify-center text-sm ${bot.avatarClass}`}
                    >
                      {bot.emoji}
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-medium">{bot.name}</div>
                      <div class="truncate text-xs text-stone-400">{bot.detail}</div>
                    </div>
                    <span class={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${bot.dotClass}`} />
                  </Link>
                )}
              </For>
            </>
          )}
        </For>

        {/* Group chats */}
        <div class="px-2.5 pt-5 pb-1 text-[13px] text-stone-400">Group chats</div>
        <For each={groupChats}>
          {(chat) => (
            <Link
              to="/$id"
              params={{ id: chat.id }}
              class={rowClass(chat.id)}
              onClick={(e) => handleSelect(chat.id, e)}
            >
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200/70">
                <Users class="h-3.5 w-3.5 text-stone-400" />
              </div>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">{chat.name}</div>
                <div class="truncate text-xs text-stone-400">{chat.members}</div>
              </div>
            </Link>
          )}
        </For>
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

      <Dialog
        open={settingsOpen()}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
        description="Hosts, models, and workspace defaults."
        class="max-w-xl"
        closeOnBackdrop={false}
      >
        <Suspense
          fallback={
            <div class="space-y-2">
              <div class="h-5 w-40 animate-pulse rounded bg-stone-100" />
              <div class="h-12 animate-pulse rounded-xl bg-stone-100" />
              <div class="h-12 animate-pulse rounded-xl bg-stone-100" />
            </div>
          }
        >
          <SettingsContent />
        </Suspense>
      </Dialog>
    </aside>
  )
}
