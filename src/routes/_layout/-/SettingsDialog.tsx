import { For, Show, createSignal } from 'solid-js'
import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import Server from 'lucide-solid/icons/server'
import Trash2 from 'lucide-solid/icons/trash-2'
import { createWorkspace, deleteWorkspace, listWorkspaces } from '../../../server/workspaces'
import { logout } from '../../../server/auth'
import { Dialog } from '../../../shared/Dialog'

export default function SettingsDialog(props: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const workspacesQuery = createQuery(() => ({ queryKey: ['workspaces'], queryFn: listWorkspaces }))
  const [name, setName] = createSignal('')
  const [path, setPath] = createSignal('')
  const [endpoint, setEndpoint] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)

  const invalidateWorkspaces = () => queryClient.invalidateQueries({ queryKey: ['workspaces'] })

  const addWorkspace = createMutation(() => ({
    mutationFn: async (input: { name: string; path?: string; endpoint?: string }) =>
      createWorkspace({ data: input }),
    onSuccess: () => {
      invalidateWorkspaces()
      setName('')
      setPath('')
      setEndpoint('')
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong'),
  }))

  const removeWorkspace = createMutation(() => ({
    mutationFn: async (id: string) => deleteWorkspace({ data: { id } }),
    onSuccess: () => invalidateWorkspaces(),
  }))

  const signOut = async () => {
    await logout()
    await navigate({ to: '/login' })
  }

  const submitWorkspace = (e: SubmitEvent) => {
    e.preventDefault()
    if (!name().trim()) {
      setError('Workspace name is required')
      return
    }
    setError(null)
    addWorkspace.mutate({ name: name(), path: path() || undefined, endpoint: endpoint() || undefined })
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title="Settings"
      description="Workspaces, models, and defaults."
      class="max-w-xl"
      closeOnBackdrop={false}
    >
      <div class="space-y-6">
        <section>
          <h3 class="mb-2 text-[13px] text-stone-400">Workspaces</h3>
          <Show
            when={!workspacesQuery.isPending}
            fallback={<div class="h-16 animate-pulse rounded-xl bg-stone-100" />}
          >
            <div class="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
              <For each={workspacesQuery.data ?? []}>
                {(ws) => (
                  <div class="flex items-center gap-3 p-3">
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                      <Server class="h-4 w-4" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium">{ws.name}</div>
                      <div class="truncate text-xs text-stone-400">
                        {[ws.path, ws.endpoint ?? 'local'].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      class="cursor-pointer rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-900"
                      title={`Delete ${ws.name}`}
                      onClick={() => removeWorkspace.mutate(ws.id)}
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </For>
              <Show when={(workspacesQuery.data ?? []).length === 0}>
                <div class="p-3 text-xs text-stone-400">No workspaces yet.</div>
              </Show>
            </div>

            <form class="mt-3 flex gap-2" onSubmit={submitWorkspace}>
              <input
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Name"
                class="w-28 min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs placeholder-stone-400 focus:border-stone-400 focus:outline-none"
              />
              <input
                value={path()}
                onInput={(e) => setPath(e.currentTarget.value)}
                placeholder="Directory path"
                class="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs placeholder-stone-400 focus:border-stone-400 focus:outline-none"
              />
              <input
                value={endpoint()}
                onInput={(e) => setEndpoint(e.currentTarget.value)}
                placeholder="Endpoint IP (optional)"
                class="w-40 min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs placeholder-stone-400 focus:border-stone-400 focus:outline-none"
              />
              <button
                type="submit"
                class="shrink-0 cursor-pointer rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-600"
              >
              Add
            </button>
            </form>
            <Show when={error()}>
              <p class="mt-2 text-xs text-red-700">{error()}</p>
            </Show>
          </Show>
        </section>

        <p class="text-xs leading-relaxed text-stone-400">
          Model assignments, budgets, and skills management land in M2. Everything here is a
          placeholder for now.
        </p>

        <div class="border-t border-stone-200 pt-4">
          <button
            class="cursor-pointer rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </Dialog>
  )
}
