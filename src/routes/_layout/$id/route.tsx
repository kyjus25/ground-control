import { createFileRoute } from '@tanstack/solid-router'
import { Show, createSignal } from 'solid-js'
import { Drawer } from '../../../shared/Drawer'
import { getBot, listBots } from '../../../server/bots'
import { getGroupChat } from '../../../server/chats'
import { listMessages } from '../../../server/messages'
import { Sidebar } from './-/Sidebar'
import { BotThread } from './-/BotThread'
import { GroupThread } from './-/GroupThread'
import { Thread } from './-/Thread'
import { ThreadStorageDialog, type StorageTab } from './-/ThreadStorageDialog'

type HistoryRow = { senderType: 'user' | 'bot'; senderBotId: string | null; content: string }

export const Route = createFileRoute('/_layout/$id')({
  head: () => ({
    meta: [{ title: 'Ground Control' }],
  }),
  // Bot ids open a live 1:1 thread, group chat ids a live group thread;
  // anything else falls back to the placeholder thread.
  loader: async ({ params }) => {
    const [bot, roster] = await Promise.all([getBot({ data: { id: params.id } }), listBots()])
    if (bot) {
      const history = await listMessages({ data: { threadId: params.id } })
      return { bot, group: null, history, roster }
    }
    const group = await getGroupChat({ data: { id: params.id } })
    if (group) {
      const history = await listMessages({ data: { threadId: params.id } })
      return { bot: null, group, history, roster }
    }
    return { bot: null, group: null, history: [] as HistoryRow[], roster }
  },
  component: Workspace,
})

function Workspace() {
  const data = Route.useLoaderData()
  // The right rail is a slide-in drawer below lg, inline above. One Sidebar.
  const [railOpen, setRailOpen] = createSignal(false)
  const openRail = () => setRailOpen(true)
  const [storageTab, setStorageTab] = createSignal<StorageTab | null>(null)
  const storageThread = () => data().bot ?? data().group
  const openStorage = (tab: StorageTab) => {
    setRailOpen(false)
    setStorageTab(tab)
  }
  return (
    <>
      <Show
        when={!data().group}
        fallback={
          <Show when={data().group} keyed>
            {(group) => <GroupThread chat={group} history={data().history as HistoryRow[]} roster={data().roster} onOpenRail={openRail} />}
          </Show>
        }
      >
        <Show when={data().bot} fallback={<Thread onOpenRail={openRail} />} keyed>
          {(bot) => <BotThread bot={bot} history={data().history as HistoryRow[]} roster={data().roster} onOpenRail={openRail} />}
        </Show>
      </Show>
      <Drawer
        side="right"
        inlineAt="lg"
        open={railOpen()}
        onClose={() => setRailOpen(false)}
        class="w-72"
      >
        <Sidebar onOpenStorage={storageThread() ? openStorage : undefined} />
      </Drawer>
      <Show when={storageThread()?.id} keyed>
        {(threadId) => <Show when={storageTab()}>
          {(tab) => <ThreadStorageDialog threadId={threadId} name={storageThread()!.name} group={Boolean(data().group)} initialTab={tab()} onClose={() => setStorageTab(null)} />}
        </Show>}
      </Show>
    </>
  )
}
