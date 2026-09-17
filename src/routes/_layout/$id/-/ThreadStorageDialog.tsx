import { For, Show, Suspense, createSignal } from 'solid-js'
import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query'
import { Dialog } from '../../../../shared/Dialog'
import { deleteThreadSkill, getThreadMemory, listThreadSkills, saveThreadSkill, updateThreadMemory } from './thread-storage-api'
import { MAX_THREAD_SKILLS } from '../../../../types/storage-schemas'
import { contentBytes, memoryDraftError, skillDraftError } from './storage-editor-model'

export type StorageTab = 'memory' | 'skills'
type Memory = Awaited<ReturnType<typeof getThreadMemory>>
type Skill = Awaited<ReturnType<typeof listThreadSkills>>[number]
const secondary = 'cursor-pointer rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 disabled:cursor-default disabled:opacity-50'
const primary = 'cursor-pointer rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-600 disabled:cursor-default disabled:opacity-50'
const textarea = 'w-full resize-y rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-900 focus:border-stone-400 focus:outline-none [scrollbar-gutter:stable]'
const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed. Try again.'
const confirmDiscard = () => typeof window !== 'undefined' && window.confirm('Discard unsaved changes?')

export function ThreadStorageDialog(props: { threadId: string; name: string; group: boolean; initialTab: StorageTab; onClose: () => void }) {
  const [dirty, setDirty] = createSignal(false)
  const [pending, setPending] = createSignal(false)
  const close = () => {
    if (!pending() && (!dirty() || confirmDiscard())) props.onClose()
  }
  return (
    <Dialog open onClose={close} title={`${props.name} · Memory & skills`} class="max-w-3xl"
      description={props.group ? 'Shared files for this group thread. Bot private files remain separate.' : 'Private files for this bot. Group files remain separate.'}>
      <Suspense fallback={<p class="text-sm text-stone-600" role="status">Loading thread files…</p>}>
        <StorageEditor {...props} onDirty={setDirty} onPending={setPending} />
      </Suspense>
    </Dialog>
  )
}

function StorageEditor(props: { threadId: string; initialTab: StorageTab; onDirty: (value: boolean) => void; onPending: (value: boolean) => void }) {
  const threadId = props.threadId
  const queryClient = useQueryClient()
  const [tab, setTab] = createSignal(props.initialTab)
  const [memoryBase, setMemoryBase] = createSignal<Memory | null>(null)
  const [memoryDraft, setMemoryDraft] = createSignal('')
  const [latest, setLatest] = createSignal<Memory | null>(null)
  const [selected, setSelected] = createSignal<Skill | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [editingSkill, setEditingSkill] = createSignal(false)
  const [skillName, setSkillName] = createSignal('')
  const [skillDraft, setSkillDraft] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal('')
  const [refreshing, setRefreshing] = createSignal(false)
  const memoryKey = ['thread-memory', threadId]
  const skillsKey = ['thread-skills', threadId]
  const memory = createQuery(() => ({
    queryKey: memoryKey,
    queryFn: () => getThreadMemory({ data: { threadId } }),
    enabled: tab() === 'memory',
    refetchOnWindowFocus: false,
    throwOnError: false,
    retry: false,
  }))
  const skills = createQuery(() => ({
    queryKey: skillsKey,
    queryFn: () => listThreadSkills({ data: { threadId } }),
    enabled: tab() === 'skills',
    refetchOnWindowFocus: false,
    throwOnError: false,
    retry: false,
  }))
  const dirty = () => Boolean(memoryBase() && memoryDraft() !== memoryBase()!.content)
    || (editingSkill() && (creating() ? Boolean(skillName() || skillDraft()) : skillDraft() !== selected()?.content))
  const syncDirty = () => props.onDirty(dirty())
  const clearFeedback = () => { setError(null); setStatus('') }
  const reset = () => {
    setMemoryBase(null)
    setLatest(null)
    setSelected(null)
    setCreating(false)
    setEditingSkill(false)
    props.onDirty(false)
    clearFeedback()
  }
  const busy = () => saveMemory.isPending || saveSkill.isPending || removeSkill.isPending || refreshing()
  const begin = () => { clearFeedback(); props.onPending(true) }
  const settled = () => props.onPending(false)
  const saveMemory = createMutation(() => ({
    mutationFn: (data: { content: string; expectedRevision: string }) => updateThreadMemory({ data: { threadId, ...data } }),
    onMutate: begin,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(memoryKey, snapshot)
      setMemoryBase(null)
      setLatest(null)
      props.onDirty(false)
      setStatus('Memory saved.')
    },
    onError: (err) => setError(`${message(err)} Your draft is preserved. Load the latest memory below to check for concurrent changes.`),
    onSettled: settled,
  }))
  const saveSkill = createMutation(() => ({
    mutationFn: (data: { name: string; content: string }) => saveThreadSkill({ data: { threadId, ...data } }),
    onMutate: begin,
    onSuccess: (file) => {
      queryClient.setQueryData<Skill[]>(skillsKey, (files = []) => [...files.filter((entry) => entry.name !== file.name), file].sort((a, b) => a.name.localeCompare(b.name)))
      setSelected(file)
      setCreating(false)
      setEditingSkill(false)
      props.onDirty(false)
      setStatus('Skill saved.')
    },
    onError: (err) => setError(message(err)),
    onSettled: settled,
  }))
  const removeSkill = createMutation(() => ({
    mutationFn: (name: string) => deleteThreadSkill({ data: { threadId, name } }),
    onMutate: begin,
    onSuccess: (_, name) => {
      queryClient.setQueryData<Skill[]>(skillsKey, (files = []) => files.filter((file) => file.name !== name))
      reset()
      setStatus('Skill deleted.')
    },
    onError: (err) => setError(message(err)),
    onSettled: settled,
  }))
  const refresh = async () => {
    if (busy()) return
    clearFeedback()
    setRefreshing(true)
    props.onPending(true)
    try {
      if (tab() === 'memory') {
        const snapshot = await getThreadMemory({ data: { threadId } })
        queryClient.setQueryData(memoryKey, snapshot)
        if (memoryBase()) setLatest(snapshot)
      } else {
        if (dirty() && !confirmDiscard()) return
        const files = await listThreadSkills({ data: { threadId } })
        queryClient.setQueryData(skillsKey, files)
        reset()
      }
    } catch (err) { setError(message(err)) } finally {
      setRefreshing(false)
      props.onPending(false)
    }
  }
  const selectSkill = (file: Skill | null) => {
    if (busy() || (dirty() && !confirmDiscard())) return
    reset()
    setSelected(file)
    setCreating(!file)
    setEditingSkill(!file)
    setSkillName(file?.name ?? '')
    setSkillDraft(file?.content ?? '')
  }

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <For each={['memory', 'skills'] as const}>
          {(item) => <button type="button" aria-pressed={tab() === item} disabled={busy()}
            class={tab() === item ? primary : secondary}
            onClick={() => {
              if (tab() === item || (dirty() && !confirmDiscard())) return
              reset()
              setTab(item)
            }}>{item === 'memory' ? 'MEMORY.md' : 'Skill registry'}</button>}
        </For>
        <button type="button" class={`${secondary} ml-auto`} disabled={busy()} onClick={refresh}>
          {refreshing() ? 'Loading…' : memoryBase() ? 'Load latest memory' : 'Refresh'}
        </button>
      </div>
      <p class="break-all font-mono text-xs text-stone-400">{threadId}/{tab() === 'memory' ? 'MEMORY.md' : 'skills/'}</p>
      <Show when={error()}><p role="alert" class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error()}</p></Show>
      <Show when={status()}><p role="status" class="text-xs text-green-700">{status()}</p></Show>
      <Show when={tab() === 'memory'}>
        <Show when={memory.isError}><p role="alert" class="text-sm text-red-700">Could not load memory. Use Refresh to retry.</p></Show>
        <Show when={memory.data}>
          {(snapshot) => <>
            <Show when={memoryBase()} fallback={<>
              <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed [scrollbar-gutter:stable]">{snapshot().content || 'No memory yet.'}</pre>
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-stone-400">{snapshot().bytes} bytes · revision {snapshot().revision.slice(0, 12)}</span>
                <button type="button" class={secondary} disabled={busy()} onClick={() => {
                  clearFeedback()
                  setMemoryBase(snapshot())
                  setMemoryDraft(snapshot().content)
                }}>Edit memory</button>
              </div>
            </>}>
              <form class="space-y-3" onSubmit={(event) => {
                event.preventDefault()
                if (busy()) return
                const validation = memoryDraftError(memoryDraft())
                if (validation) { setError(validation); return }
                saveMemory.mutate({ content: memoryDraft(), expectedRevision: memoryBase()!.revision })
              }}>
                <label for="thread-memory-content" class="block text-[13px] text-stone-600">Memory markdown</label>
                <textarea id="thread-memory-content" rows={14} class={textarea} value={memoryDraft()} disabled={busy()}
                  onInput={(event) => { setMemoryDraft(event.currentTarget.value); syncDirty() }} />
                <p class="text-xs text-stone-400">{contentBytes(memoryDraft())} / 1,048,576 bytes. Saves only if the loaded revision is still current.</p>
                <Show when={latest()}>
                  {(current) => <div class="space-y-3 rounded-lg border border-stone-200 bg-stone-100 p-3">
                    <p class="text-xs text-stone-600">{current().revision === memoryBase()!.revision ? 'Your loaded revision is still current.' : 'Memory changed. Compare the latest content with your draft and merge any changes before saving.'}</p>
                    <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs [scrollbar-gutter:stable]">{current().content || 'Empty memory.'}</pre>
                    <Show when={current().revision !== memoryBase()!.revision}>
                      <button type="button" class={secondary} disabled={busy()} onClick={() => {
                        setMemoryBase(current())
                        setLatest(null)
                        syncDirty()
                        clearFeedback()
                      }}>I have merged the changes · use this revision</button>
                    </Show>
                  </div>}
                </Show>
                <div class="flex justify-end gap-2">
                  <button type="button" class={secondary} disabled={busy()} onClick={() => { if (!dirty() || confirmDiscard()) reset() }}>Cancel</button>
                  <button type="submit" class={primary} disabled={busy() || !dirty() || Boolean(memoryDraftError(memoryDraft()))}>{saveMemory.isPending ? 'Saving…' : 'Save memory'}</button>
                </div>
              </form>
            </Show>
          </>}
        </Show>
      </Show>
      <Show when={tab() === 'skills'}>
        <p class="text-xs leading-relaxed text-stone-600">Scoped markdown instructions, not executable tools. Tool permissions live in the bot editor. Skill saves replace the file; concurrent edits are not revision-protected.</p>
        <Show when={skills.isError}><p role="alert" class="text-sm text-red-700">Could not load skills. Use Refresh to retry.</p></Show>
        <Show when={skills.data}>
          {(files) => <>
            <div class="flex items-center justify-between">
              <span class="text-xs text-stone-400">{files().length} / {MAX_THREAD_SKILLS} files</span>
              <button type="button" class={secondary} disabled={busy() || files().length >= MAX_THREAD_SKILLS} onClick={() => selectSkill(null)}>Create skill</button>
            </div>
            <div class="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <div class="max-h-80 space-y-1 overflow-y-auto [scrollbar-gutter:stable]">
                <Show when={files().length} fallback={<p class="py-3 text-xs text-stone-400">No skills yet. Create a markdown file to add instructions.</p>}>
                  <For each={files()}>{(file) => <button type="button" disabled={busy()} aria-pressed={selected()?.name === file.name}
                    class={`w-full cursor-pointer break-all rounded-lg border px-3 py-2 text-left text-xs disabled:cursor-default ${selected()?.name === file.name ? 'border-stone-200 bg-white' : 'border-transparent hover:bg-stone-200'}`}
                    onClick={() => selectSkill(file)}>{file.name}</button>}</For>
                </Show>
              </div>
              <div class="min-w-0 space-y-3">
                <Show when={editingSkill()} fallback={
                  <Show when={selected()} fallback={<p class="py-3 text-xs text-stone-400">Select a file to view or edit its markdown.</p>}>
                    {(file) => <>
                      <h3 class="break-all text-sm font-medium">{file().name}</h3>
                      <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed [scrollbar-gutter:stable]">{file().content || 'This skill file is empty.'}</pre>
                      <div class="flex justify-end gap-2">
                        <button type="button" class={secondary} disabled={busy()} onClick={() => {
                          if (typeof window !== 'undefined' && window.confirm(`Delete ${file().name} from this thread? This cannot be undone.`)) removeSkill.mutate(file().name)
                        }}>{removeSkill.isPending ? 'Deleting…' : 'Delete skill'}</button>
                        <button type="button" class={secondary} disabled={busy()} onClick={() => { clearFeedback(); setEditingSkill(true) }}>Edit skill</button>
                      </div>
                    </>}
                  </Show>
                }>
                  <form class="space-y-3" onSubmit={(event) => {
                    event.preventDefault()
                    if (busy()) return
                    const validation = skillDraftError(skillName(), skillDraft(), files().map((file) => file.name), creating())
                    if (validation) { setError(validation); return }
                    saveSkill.mutate({ name: skillName(), content: skillDraft() })
                  }}>
                    <label for="thread-skill-name" class="block text-[13px] text-stone-600">Filename</label>
                    <input id="thread-skill-name" class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:border-stone-400 focus:outline-none"
                      placeholder="research.md" value={skillName()} disabled={!creating() || busy()} required
                      onInput={(event) => { setSkillName(event.currentTarget.value); syncDirty() }} />
                    <p class="text-xs text-stone-400">Lowercase letters, digits, hyphens or underscores; end with .md. No paths.</p>
                    <label for="thread-skill-content" class="block text-[13px] text-stone-600">Skill markdown</label>
                    <textarea id="thread-skill-content" rows={12} class={textarea} value={skillDraft()} disabled={busy()}
                      onInput={(event) => { setSkillDraft(event.currentTarget.value); syncDirty() }} />
                    <p class="text-xs text-stone-400">{contentBytes(skillDraft())} / 16,384 bytes</p>
                    <div class="flex justify-end gap-2">
                      <button type="button" class={secondary} disabled={busy()} onClick={() => { if (!dirty() || confirmDiscard()) reset() }}>Cancel</button>
                      <button type="submit" class={primary} disabled={busy()}>{saveSkill.isPending ? 'Saving…' : creating() ? 'Create skill' : 'Save skill'}</button>
                    </div>
                  </form>
                </Show>
              </div>
            </div>
          </>}
        </Show>
      </Show>
    </div>
  )
}
