import { For, Show, Suspense } from 'solid-js'
import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import Plus from 'lucide-solid/icons/plus'
import Pin from 'lucide-solid/icons/pin'
import X from 'lucide-solid/icons/x'
import { attachThreadWorkspace, detachThreadWorkspace, listThreadWorkspaces, listWorkspaces } from '../../../../server/workspaces'

// Right rail on threads. Browser first, then Workspaces, Pinned, and Jobs.
export function Sidebar() {
  const params = useParams({ strict: false })
  const threadId = () => params().id!

  const queryClient = useQueryClient()
  const attached = createQuery(() => ({
    queryKey: ['thread-workspaces', threadId()],
    queryFn: () => listThreadWorkspaces({ data: { threadId: threadId()! } }),
  }))
  const allWorkspaces = createQuery(() => ({ queryKey: ['workspaces'], queryFn: listWorkspaces }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['thread-workspaces', threadId()] })

  const attach = createMutation(() => ({
    mutationFn: async (workspaceId: string) =>
      attachThreadWorkspace({ data: { threadId: threadId(), workspaceId } }),
    onSuccess: () => invalidate(),
  }))

  const detach = createMutation(() => ({
    mutationFn: async (workspaceId: string) =>
      detachThreadWorkspace({ data: { threadId: threadId(), workspaceId } }),
    onSuccess: () => invalidate(),
  }))

  return (
    <aside class="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-stone-200 bg-stone-100">
      {/* Browser */}
      <div class="border-b border-stone-200 px-5 pt-6 pb-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[13px] font-medium">Browser</h3>
          <span class="flex items-center gap-1.5 text-xs text-stone-400">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
            live
          </span>
        </div>
        <div class="aspect-video rounded-lg bg-black" title="Shared browser session (placeholder)" />
      </div>

      {/* Workspaces */}
      {/* Local boundary: createQuery suspends its reader while fetching, and
          without this the router-level Suspense blanks the whole thread. */}
      <Suspense fallback={<div class="border-b border-stone-200 px-5 pt-6 pb-5 text-xs text-stone-400">Loading workspaces…</div>}>
        <div class="border-b border-stone-200 px-5 pt-6 pb-5">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-[13px] font-medium">Workspaces</h3>
            <span class="text-xs text-stone-400">{attached.data?.length ?? 0}</span>
          </div>
          <Show
            when={(attached.data?.length ?? 0) > 0}
            fallback={<p class="text-xs text-stone-400">No workspaces attached to this thread.</p>}
          >
            <div class="space-y-1.5">
              <For each={attached.data ?? []}>
                {(ws) => (
                  <div class="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5">
                    <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{ws.name}</span>
                    <button
                      class="cursor-pointer rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-900"
                      title="Detach workspace"
                      onClick={() => detach.mutate(ws.id)}
                    >
                      <X class="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={(allWorkspaces.data ?? []).length > (attached.data?.length ?? 0)}>
            <div class="mt-3 flex items-center gap-2">
              <select
                class="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-600 focus:border-stone-400 focus:outline-none"
                value={''}
                onChange={(e) => {
                  if (e.currentTarget.value) attach.mutate(e.currentTarget.value)
                  e.currentTarget.value = ''
                }}
              >
                <option value="">Attach a workspace…</option>
                <For each={(allWorkspaces.data ?? []).filter((w) => !(attached.data ?? []).some((a) => a.id === w.id))}>
                  {(ws) => <option value={ws.id}>{ws.name}</option>}
                </For>
              </select>
            </div>
          </Show>
          <p class="mt-2 text-[11px] leading-relaxed text-stone-400">
            Manage workspaces in Settings.
          </p>
        </div>
      </Suspense>

      {/* Pinned */}
      <div class="border-b border-stone-200 px-5 pt-5 pb-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="flex items-center gap-1.5 text-[13px] font-medium">
            <Pin class="h-3.5 w-3.5" />
            Pinned
          </h3>
          <button class="cursor-pointer text-stone-400 hover:text-stone-900" title="Pin a message">
            <Plus class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="space-y-2">
          <div class="rounded-lg border border-stone-200 bg-white p-2.5">
            <div class="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium">
              <span class="text-sm">🧭</span>
              Scout
              <span class="ml-auto text-xs font-normal text-stone-400">10:33</span>
            </div>
            <p class="line-clamp-2 text-xs leading-relaxed text-stone-600">
              Recommendation: SSE for delivery, SQLite for history.
            </p>
          </div>
          <div class="rounded-lg border border-stone-200 bg-white p-2.5">
            <div class="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium">
              <span class="text-sm">🔥</span>
              Blaze
              <span class="ml-auto text-xs font-normal text-stone-400">10:34</span>
            </div>
            <p class="line-clamp-2 text-xs leading-relaxed text-stone-600">
              Bots reply to @mentions only, with a reply depth of 3 so crews can't loop.
            </p>
          </div>
        </div>
      </div>

      {/* Jobs */}
      <div class="px-5 py-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[13px] font-medium">Jobs</h3>
          <button class="cursor-pointer text-stone-400 hover:text-stone-900">
            <Plus class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="space-y-3">
          <div class="flex items-start gap-2.5">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            <div>
              <div class="text-[13px]">Morning news digest</div>
              <div class="text-xs text-stone-400">daily at 7:00 · Scout</div>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            <div>
              <div class="text-[13px]">Price watch</div>
              <div class="text-xs text-stone-400">every 30 min · Scout</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
