import * as v from 'valibot'
import { For, Show, createSignal, onMount } from 'solid-js'
import { createMutation, useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import Trash2 from 'lucide-solid/icons/trash-2'
import { createBot, updateBot, deleteBot } from '../server/bots'
import { BotInputWithIdSchema, BotInputSchema } from '../types/bot-schemas'
import { DEFAULT_MODEL_ID, ZAI_MODELS } from '../types/ai'
import type { Bot, BotColor, BotShape } from '../types/bot'
import { SKILLS, normalizeSkills, type SkillId } from '../types/skill'

const EMOJIS = [
  '🧭', '📚', '🔥', '🛠️', '🤖', '💡', '🌙',
  '⚖️', '🎯', '🧪', '✉️', '🗂️', '📡', '🧠',
  '🐛', '🎨', '📈', '🔍', '🗺️', '🧩', '⚙️',
  '🚀', '🌱', '🎓', '☀️', '📦', '📰', '📅',
  '📝', '💻', '🎵', '🎮', '📷', '🏠', '🚗',
  // Fitness & training agents
  '🏋️', '💪', '🏃', '🧘', '🚴', '⚽',
  // Everyday-life agents: money, health, cooking, travel, shopping, pets
  '💰', '🩺', '🍳', '✈️', '🛒', '🐾',
  // Reminders & entertainment
  '⏰', '🎬',
]

const COLOR_SWATCHES: Array<{ color: BotColor; class: string }> = [
  { color: 'green', class: 'bg-green-100' },
  { color: 'teal', class: 'bg-teal-100' },
  { color: 'sky', class: 'bg-sky-100' },
  { color: 'blue', class: 'bg-blue-100' },
  { color: 'violet', class: 'bg-violet-100' },
  { color: 'fuchsia', class: 'bg-fuchsia-100' },
  { color: 'rose', class: 'bg-rose-100' },
  { color: 'red', class: 'bg-red-100' },
  { color: 'orange', class: 'bg-orange-100' },
  { color: 'amber', class: 'bg-amber-100' },
  { color: 'lime', class: 'bg-lime-100' },
  { color: 'stone', class: 'bg-stone-100' },
]

const SHAPES: Array<{ shape: BotShape; label: string; class: string }> = [
  { shape: 'circle', label: 'Circle', class: 'rounded-full' },
  { shape: 'square', label: 'Square', class: 'rounded-md' },
  { shape: 'hex', label: 'Hexagon', class: 'shape-hex' },
  { shape: 'triangle', label: 'Triangle', class: 'shape-tri' },
  { shape: 'diamond', label: 'Diamond', class: 'shape-diamond' },
]

const SOUL_PRESETS: Array<{ label: string; text: string }> = [
  { label: 'Witty', text: 'Dry wit and playful sarcasm. Always lands a one-liner before answering.' },
  { label: 'Funny', text: 'Goofy and lighthearted. Jokes first, answers second.' },
  { label: 'Expert', text: 'Precise, thorough and technical. Shows the reasoning and cites sources.' },
  { label: 'Short', text: 'Terse. One or two sentences max. No fluff, no filler.' },
  { label: 'Caveman', text: 'Talk like a caveman. Short words. Big wisdom. Occasional grunt.' },
]

export default function BotEditorForm(props: {
  bot: Bot | null
  onDone: () => void
  allowDelete?: boolean
  submitLabel?: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const editing = () => props.bot !== null

  const [name, setName] = createSignal(props.bot?.name ?? '')
  const [emoji, setEmoji] = createSignal(props.bot?.emoji ?? '🤖')
  const [color, setColor] = createSignal<BotColor>(props.bot?.color ?? 'green')
  const [shape, setShape] = createSignal<BotShape>(props.bot?.shape ?? 'circle')
  const [category, setCategory] = createSignal(props.bot?.category ?? '')
  const [modelId, setModelId] = createSignal(props.bot?.modelId ?? DEFAULT_MODEL_ID)
  const [soul, setSoul] = createSignal(props.bot?.soul ?? '')
  const [instructions, setInstructions] = createSignal(props.bot?.instructions ?? '')
  const [skills, setSkills] = createSignal<SkillId[]>(
    props.bot
      ? normalizeSkills(props.bot.skills).filter((id) => SKILLS.some((skill) => skill.id === id && skill.available))
      : SKILLS.filter((skill) => skill.available).map((skill) => skill.id),
  )
  const [tab, setTab] = createSignal<'identity' | 'avatar' | 'skills'>('identity')

  onMount(() => {
    if (!props.bot) {
      setEmoji(EMOJIS[Math.floor(Math.random() * EMOJIS.length)])
      setColor(COLOR_SWATCHES[Math.floor(Math.random() * COLOR_SWATCHES.length)].color)
      setShape(SHAPES[Math.floor(Math.random() * SHAPES.length)].shape)
    }
  })

  const TABS: Array<{ id: 'identity' | 'avatar' | 'skills'; label: string }> = [
    { id: 'identity', label: 'Identity' },
    { id: 'avatar', label: 'Avatar' },
    { id: 'skills', label: 'Skills' },
  ]
  const [error, setError] = createSignal<string | null>(null)

  const save = createMutation(() => ({
    mutationFn: async (values: {
      name: string
      emoji: string
      color: BotColor
      shape: BotShape
      category: string
      soul: string
      instructions: string
      modelId: string
      skills: string
    }) => {
      if (editing()) {
        await updateBot({ data: { ...values, id: props.bot!.id } })
      } else {
        await createBot({ data: values })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] })
      props.onDone()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong'),
  }))

  const remove = createMutation(() => ({
    mutationFn: async () => deleteBot({ data: { id: props.bot!.id } }),
    onSuccess: () => {
      // Deleting the last bot leaves an empty crew — restart onboarding.
      const remaining = (queryClient.getQueryData<{ length: number }>(['bots'])?.length ?? 1) - 1
      queryClient.invalidateQueries({ queryKey: ['bots'] })
      props.onDone()
      if (remaining === 0) navigate({ to: '/onboarding' })
    },
  }))

  const toggleSkill = (skill: SkillId) => {
    if (skill === 'memory-read' || !SKILLS.some((entry) => entry.id === skill && entry.available)) return
    setSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]))
  }

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    setError(null)
    const values = {
      name: name(),
      emoji: emoji(),
      color: color(),
      shape: shape(),
      category: category(),
      soul: soul(),
      instructions: instructions(),
      modelId: modelId(),
      skills: JSON.stringify(skills()),
    }
    const parsed = editing()
      ? v.safeParse(BotInputWithIdSchema, { ...values, id: props.bot!.id })
      : v.safeParse(BotInputSchema, values)
    if (!parsed.success) {
      setError(parsed.issues[0]?.message ?? 'Check the form and try again')
      return
    }
    save.mutate(values)
  }

  return (
    <form class="space-y-5" onSubmit={submit}>
      {/* Live avatar preview — always visible, centered */}
      <div class="flex flex-col items-center gap-2 border-b border-stone-200 pb-4">
        <div
          class={`flex h-20 w-20 items-center justify-center text-4xl ${SHAPES.find((s) => s.shape === shape())!.class} ${COLOR_SWATCHES.find((c) => c.color === color())!.class}`}
        >
          {emoji()}
        </div>
        <div class="text-sm font-medium">{name() || 'Unnamed bot'}</div>
      </div>

      {/* Tabs */}
      <div class="flex gap-1 rounded-lg bg-stone-100 p-1">
        <For each={TABS}>
          {(t) => (
            <button
              type="button"
              class={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab() === t.id
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <Show when={tab() === 'avatar'}>
        <div class="space-y-4">
          <div>
            <p class="mb-2 text-[13px] text-stone-400">Emoji</p>
            <div class="grid grid-cols-7 gap-1.5">
              <For each={EMOJIS}>
                {(e) => (
                  <button
                    type="button"
                    class={`flex h-9 cursor-pointer items-center justify-center rounded-lg border text-lg hover:bg-stone-100 ${
                      emoji() === e ? 'border-stone-400 bg-white' : 'border-transparent'
                    }`}
                    onClick={() => setEmoji(e)}
                  >
                    {e}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div>
            <p class="mb-2 text-[13px] text-stone-400">Color</p>
            <div class="flex flex-wrap gap-2">
              <For each={COLOR_SWATCHES}>
                {(swatch) => (
                  <button
                    type="button"
                    title={swatch.color}
                    class={`h-7 w-7 cursor-pointer rounded-full ${swatch.class} ${
                      color() === swatch.color ? 'ring-2 ring-stone-900 ring-offset-1' : ''
                    }`}
                    onClick={() => setColor(swatch.color)}
                  />
                )}
              </For>
            </div>
          </div>
          <div>
            <p class="mb-2 text-[13px] text-stone-400">Shape</p>
            <div class="flex flex-wrap gap-2">
              <For each={SHAPES}>
                {(s) => (
                  <button
                    type="button"
                    class={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-100 ${
                      shape() === s.shape ? 'border-stone-400 bg-stone-100' : 'border-stone-200 bg-white'
                    }`}
                    onClick={() => setShape(s.shape)}
                  >
                    <span class={`flex h-4 w-4 items-center justify-center bg-stone-300 ${s.class}`}>
                      <span class="h-1.5 w-1.5 rounded-sm bg-stone-600" />
                    </span>
                    {s.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <Show when={tab() === 'identity'}>
        <div class="space-y-4">
          <div>
            <label for="bot-name" class="mb-1.5 block text-[13px] font-medium text-stone-600">
              Name
            </label>
            <input
              id="bot-name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Scout"
              class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
            />
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label for="bot-category" class="mb-1.5 block text-[13px] font-medium text-stone-600">
                Category
              </label>
              <input
                id="bot-category"
                value={category()}
                onInput={(e) => setCategory(e.currentTarget.value)}
                placeholder="Research, Ops, …"
                class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
              />
            </div>
            <div>
              <label for="bot-model" class="mb-1.5 block text-[13px] font-medium text-stone-600">
                Model
              </label>
              <select
                id="bot-model"
                value={modelId()}
                onChange={(e) => setModelId(e.currentTarget.value)}
                class="w-full cursor-pointer rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 focus:border-stone-400 focus:outline-none"
              >
                <option value="">Not set</option>
                <For each={ZAI_MODELS}>
                  {(m) => <option value={m.id}>{m.label} · {m.hint}</option>}
                </For>
              </select>
            </div>
          </div>
          <div>
            <label for="bot-soul" class="mb-1.5 block text-[13px] font-medium text-stone-600">
              Soul
            </label>
            <textarea
              id="bot-soul"
              rows="3"
              value={soul()}
              onInput={(e) => setSoul(e.currentTarget.value)}
              placeholder="Personality and core character…"
              class="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
            />
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={SOUL_PRESETS}>
                {(preset) => (
                  <button
                    type="button"
                    class="cursor-pointer rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600 hover:bg-stone-100"
                    onClick={() => setSoul(preset.text)}
                  >
                    {preset.label}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div>
            <label for="bot-instructions" class="mb-1.5 block text-[13px] font-medium text-stone-600">
              Instructions
            </label>
            <textarea
              id="bot-instructions"
              rows="2"
              value={instructions()}
              onInput={(e) => setInstructions(e.currentTarget.value)}
              placeholder="System-level operating rules…"
              class="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
            />
          </div>
        </div>
      </Show>

      <Show when={tab() === 'skills'}>
        <div class="space-y-2">
          <p class="text-xs text-stone-600">Tool permissions apply to this bot. Markdown skill files are managed in each thread's sidebar.</p>
          <For each={SKILLS}>
            {(skill) => {
              const enabled = () => skill.available && (skill.id === 'memory-read' || skills().includes(skill.id))
              return (
                <button
                  type="button"
                  disabled={!skill.available || skill.id === 'memory-read'}
                  aria-pressed={enabled()}
                  class={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-default ${
                    enabled()
                      ? 'border-stone-400 bg-stone-100 text-stone-900'
                      : 'border-stone-200 bg-white text-stone-600 enabled:hover:bg-stone-50'
                  }`}
                  onClick={() => toggleSkill(skill.id)}
                >
                  <span>
                    <span class="block font-medium">{skill.name}</span>
                    <span class="mt-1 block text-xs text-stone-600">{skill.description}</span>
                  </span>
                  <span class="shrink-0 text-xs text-stone-600">
                    {!skill.available ? 'Unavailable' : skill.id === 'memory-read' ? 'Always on' : enabled() ? 'On' : 'Off'}
                  </span>
                </button>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={error()}>
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error()}
        </p>
      </Show>

      <button
        type="submit"
        disabled={save.isPending}
        class="w-full cursor-pointer rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-600 disabled:cursor-default disabled:opacity-60"
      >
        {props.submitLabel ?? (save.isPending ? 'Saving…' : 'Save')}
      </button>

      <Show when={props.allowDelete && props.bot}>
        <div class="border-t border-stone-200 pt-4">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => remove.mutate()}
          >
            <Trash2 class="h-3.5 w-3.5" />
            Delete bot
          </button>
        </div>
      </Show>
    </form>
  )
}
