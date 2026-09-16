import { For, Show, createSignal } from 'solid-js'
import { useNavigate } from '@tanstack/solid-router'
import { useQueryClient } from '@tanstack/solid-query'
import { createGroupChat } from '../../../server/chats'
import type { Bot } from '../../../types/bot'
import { Dialog } from '../../../shared/Dialog'

// §3.5: the user creates a chat and adds member bots. Members are the bots
// that can be @mentioned in the thread.
export default function CreateGroupChatDialog(props: {
  bots: Array<Bot>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = createSignal('')
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [error, setError] = createSignal<string | null>(null)
  const [pending, setPending] = createSignal(false)

  const toggle = (id: string) => {
    const next = new Set(selected())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    setError(null)
    if (!name().trim()) return setError('Chat name is required')
    if (selected().size === 0) return setError('Pick at least one bot member')
    setPending(true)
    try {
      const created = await createGroupChat({ data: { name: name().trim(), botIds: [...selected()] } })
      await queryClient.invalidateQueries({ queryKey: ['chats'] })
      await navigate({ to: `/${created.id}` })
      props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title="New group chat"
      description="Name the chat and add member bots."
      class="max-w-md"
      closeOnBackdrop={false}
    >
      <form class="space-y-4" onSubmit={submit}>
        <div>
          <label for="chat-name" class="mb-1.5 block text-[13px] font-medium text-stone-600">
            Name
          </label>
          <input
            id="chat-name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Weekend Project Crew"
            class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
          />
        </div>
        <div>
          <p class="mb-1.5 text-[13px] font-medium text-stone-600">Members</p>
          <div class="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-1.5">
            <For each={props.bots}>
              {(bot) => (
                <button
                  type="button"
                  class={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm ${
                    selected().has(bot.id)
                      ? 'border-stone-400 bg-stone-100 text-stone-900'
                      : 'border-transparent text-stone-600 hover:bg-stone-50'
                  }`}
                  onClick={() => toggle(bot.id)}
                >
                  <span
                    class={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] text-white ${
                      selected().has(bot.id) ? 'border-stone-900 bg-stone-900' : 'border-stone-300 bg-white'
                    }`}
                  >
                    {selected().has(bot.id) ? '✓' : ''}
                  </span>
                  <span>{bot.emoji}</span>
                  <span class="truncate">{bot.name}</span>
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={error()}>
          <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error()}</p>
        </Show>
        <button
          type="submit"
          disabled={pending()}
          class="w-full cursor-pointer rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-600 disabled:cursor-default disabled:opacity-60"
        >
          {pending() ? 'Creating…' : 'Create chat'}
        </button>
      </form>
    </Dialog>
  )
}
