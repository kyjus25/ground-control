import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount } from 'solid-js'
import ArrowUp from 'lucide-solid/icons/arrow-up'
import { BotAvatar, COLOR_BG } from '../../../../shared/BotAvatar'
import type { ThreadMember } from './Thread'
import { COMMANDS, atomicRange, completedToken, composerText, normalizeParts, parseSubmission, replaceParts, suggestionQuery, type ChatCommand, type ComposerPart } from './composer-model'

type Choice = { id: string; part: ComposerPart; bot?: ThreadMember; description?: string }
type Snapshot = { parts: ComposerPart[]; start: number; end: number }

export function Composer(props: {
  id?: string
  title?: string
  group?: boolean
  members: readonly ThreadMember[]
  mentionableBots: readonly ThreadMember[]
  busy?: boolean
  onSend?: (text: string) => void
  onCommand?: (command: ChatCommand) => Promise<boolean>
}) {
  let editor!: HTMLDivElement
  let wrapper!: HTMLFormElement
  let composing = false
  let pending = false
  let dismissed = ''
  let tokenNodes = new WeakMap<Node, ComposerPart>()
  let saved = { start: 0, end: 0 }
  const undo: Snapshot[] = []
  const redo: Snapshot[] = []
  const listId = createUniqueId()
  const [parts, setParts] = createSignal<ComposerPart[]>([])
  const [query, setQuery] = createSignal<ReturnType<typeof suggestionQuery>>(null)
  const [active, setActive] = createSignal(0)
  const [position, setPosition] = createSignal({ left: 0, bottom: 48 })
  const [error, setError] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const busy = () => props.busy || submitting()
  const choices = createMemo<Choice[]>(() => {
    const current = query()
    if (!current) return []
    const term = current.query.toLowerCase()
    if (current.kind === 'mention') return props.mentionableBots
      .filter((bot) => bot.name.toLowerCase().startsWith(term))
      .map((bot) => ({ id: bot.id, bot, part: { kind: 'mention', text: `@${bot.name}`, botId: bot.id } }))
    return COMMANDS.filter(({ command }) => command.startsWith(term))
      .map(({ command, description }) => ({ id: command, description, part: { kind: 'command', text: `/${command}`, command } }))
  })
  const open = () => choices().length > 0

  const nodeLength = (node: Node): number => tokenNodes.get(node)?.text.length ?? (node.nodeName === 'BR' ? 1
    : node.nodeType === 3 ? (node.textContent?.length ?? 0)
    : Array.from(node.childNodes).reduce((sum, child) => sum + nodeLength(child), 0))

  const selection = () => {
    const current = window.getSelection()
    if (!current?.rangeCount) return null
    const range = current.getRangeAt(0)
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null
    const offsetAt = (target: Node, index: number) => {
      let offset = target.nodeType === 3 ? index
        : Array.from(target.childNodes).slice(0, index).reduce((sum, child) => sum + nodeLength(child), 0)
      let node = target
      while (node !== editor && node.parentNode) {
        for (const sibling of Array.from(node.parentNode.childNodes)) {
          if (sibling === node) break
          offset += nodeLength(sibling)
        }
        node = node.parentNode
      }
      return offset
    }
    return { start: offsetAt(range.startContainer, range.startOffset), end: offsetAt(range.endContainer, range.endOffset) }
  }

  const placeCaret = (start: number, end = start) => {
    const point = (offset: number): [Node, number] => {
      let remaining = offset
      for (const node of Array.from(editor.childNodes)) {
        const length = nodeLength(node)
        if (remaining <= length) {
          if (node.nodeType === 3) return [node, remaining]
          const index = Array.from(editor.childNodes).indexOf(node)
          return [editor, index + (remaining > 0 ? 1 : 0)]
        }
        remaining -= length
      }
      return [editor, editor.childNodes.length]
    }
    const range = document.createRange()
    range.setStart(...point(start))
    range.setEnd(...point(end))
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    saved = { start, end }
  }

  const updateSuggestions = () => {
    if (composing || document.activeElement !== editor) { setQuery(null); return }
    const current = selection()
    if (!current) { setQuery(null); return }
    saved = current
    const next = current.start === current.end ? suggestionQuery(parts(), current.start) : null
    const key = JSON.stringify(next)
    if (key === dismissed) { setQuery(null); return }
    if (JSON.stringify(query()) !== key) setActive(0)
    setQuery(next)
    if (!next) return
    const range = window.getSelection()?.getRangeAt(0)
    const rect = range?.getClientRects()[0] ?? editor.getBoundingClientRect()
    const bounds = wrapper.getBoundingClientRect()
    setPosition({ left: Math.max(0, Math.min(rect.left - bounds.left, bounds.width - Math.min(320, bounds.width))), bottom: bounds.bottom - rect.top + 6 })
  }

  const render = (next: ComposerPart[], start: number, end = start) => {
    tokenNodes = new WeakMap()
    const nodes: Node[] = []
    for (const part of next) {
      if (part.kind === 'text') nodes.push(document.createTextNode(part.text))
      else {
        nodes.push(document.createTextNode(''))
        const span = document.createElement('span')
        span.contentEditable = 'false'
        span.textContent = part.text
        const bot = part.kind === 'mention' ? props.mentionableBots.find((item) => item.id === part.botId) : undefined
        span.className = 'inline-flex items-center gap-1 rounded-md bg-stone-200 px-1.5 align-baseline text-[13px] font-medium text-stone-700'
        if (bot) {
          const avatar = document.createElement('span')
          avatar.className = `inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${COLOR_BG[bot.color]}`
          avatar.textContent = bot.emoji
          avatar.setAttribute('aria-hidden', 'true')
          span.prepend(avatar)
        }
        span.setAttribute('aria-label', `${part.kind === 'mention' ? 'Mention' : 'Command'} ${part.text}`)
        tokenNodes.set(span, part)
        nodes.push(span)
      }
    }
    nodes.push(document.createTextNode(''))
    editor.replaceChildren(...nodes)
    setParts(next)
    placeCaret(start, end)
    updateSuggestions()
  }

  const remember = () => {
    undo.push({ parts: parts().map((part) => ({ ...part })), ...saved })
    if (undo.length > 100) undo.shift()
    redo.length = 0
  }

  const replace = (start: number, end: number, replacement: ComposerPart[]) => {
    remember()
    const result = replaceParts(parts(), start, end, replacement)
    dismissed = ''
    setError('')
    render(result.parts, result.caret)
  }

  const insert = (replacement: ComposerPart[]) => {
    const current = selection() ?? saved
    replace(current.start, current.end, replacement)
  }

  const choose = (choice: Choice) => {
    const current = query()
    if (!current || busy()) return
    if (choice.part.kind === 'command') {
      const next = replaceParts(parts(), current.start, current.end, [choice.part])
      void send(next.parts)
      return
    }
    editor.focus()
    replace(current.start, current.end, [choice.part, { kind: 'text', text: ' ' }])
    setQuery(null)
  }

  const tokenize = () => {
    const current = selection()
    if (!current || current.start !== current.end) return false
    const token = completedToken(parts(), current.start, props.mentionableBots)
    if (!token || token.part.kind === 'command') return false
    replace(token.start, token.end, [token.part])
    return true
  }

  const send = async (override?: readonly ComposerPart[]) => {
    if (busy() || pending || composing) return
    const submission = parseSubmission(override ?? parts())
    if (submission.kind === 'empty') return
    if (submission.kind === 'error') { setError(submission.message); setQuery(null); return }
    if (submission.kind === 'message') {
      if (!props.onSend) return
      props.onSend(submission.text)
    } else {
      if (!props.onCommand) return
      pending = true
      setSubmitting(true)
      setQuery(null)
      undo.length = 0
      redo.length = 0
      setError('')
      render([], 0)
      try {
        if (!await props.onCommand(submission.command)) return
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Command failed. Try again.')
        return
      } finally {
        pending = false
        setSubmitting(false)
      }
    }
    undo.length = 0
    redo.length = 0
    setError('')
    render([], 0)
    if (submission.kind === 'command' && submission.command === 'clear') {
      editor.focus()
      placeCaret(0)
    }
  }

  const history = (back: boolean) => {
    const source = back ? undo : redo
    const target = back ? redo : undo
    const snapshot = source.pop()
    if (!snapshot) return
    target.push({ parts: parts(), ...saved })
    dismissed = ''
    render(snapshot.parts, snapshot.start, snapshot.end)
  }

  const deleteSelection = (back: boolean, word = false) => {
    const current = selection() ?? saved
    let { start, end } = current
    if (start === end) {
      const text = composerText(parts())
      if (back) {
        const prefix = text.slice(0, start)
        start -= word ? (prefix.match(/\s*\S+\s*$/u)?.[0].length ?? prefix.length) : ([...prefix].at(-1)?.length ?? 0)
      } else {
        const suffix = text.slice(end)
        end += word ? (suffix.match(/^\s*\S+\s*/u)?.[0].length ?? suffix.length) : ([...suffix][0]?.length ?? 0)
      }
    }
    if (start !== end) replace(start, end, [])
  }

  const readInput = () => {
    if (composing) return
    const current = selection() ?? saved
    const next: ComposerPart[] = []
    const walk = (node: Node) => {
      const token = tokenNodes.get(node)
      if (token) next.push(token)
      else if (node.nodeType === 3) next.push({ kind: 'text', text: node.textContent ?? '' })
      else if (node.nodeName === 'BR') next.push({ kind: 'text', text: '\n' })
      else Array.from(node.childNodes).forEach(walk)
    }
    Array.from(editor.childNodes).forEach(walk)
    remember()
    dismissed = ''
    render(normalizeParts(next), current.start, current.end)
  }

  onMount(() => {
    document.addEventListener('selectionchange', updateSuggestions)
    window.addEventListener('resize', updateSuggestions)
    onCleanup(() => {
      document.removeEventListener('selectionchange', updateSuggestions)
      window.removeEventListener('resize', updateSuggestions)
    })
  })

  createEffect(() => {
    props.id
    if (!editor) return
    undo.length = 0
    redo.length = 0
    dismissed = ''
    setError('')
    editor.replaceChildren()
    setParts([])
    saved = { start: 0, end: 0 }
    setQuery(null)
  })

  return (
    <form ref={wrapper} class="relative mx-auto w-full max-w-3xl" onSubmit={(event) => { event.preventDefault(); void send() }}>
      <Show when={props.group}>
        <div class="mb-2 flex flex-wrap gap-1.5">
          <For each={props.members}>{(member) => (
            <button type="button" disabled={submitting() || !props.onSend}
              class={`cursor-pointer rounded-full px-2 py-0.5 text-xs text-stone-600 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-stone-500 disabled:cursor-default disabled:opacity-40 ${COLOR_BG[member.color]}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.focus()
                placeCaret(saved.start, saved.end)
                const prefix = composerText(parts()).slice(0, saved.start)
                insert([
                  ...(prefix && !/\s$/u.test(prefix) ? [{ kind: 'text' as const, text: ' ' }] : []),
                  { kind: 'mention', text: `@${member.name}`, botId: member.id },
                  { kind: 'text', text: ' ' },
                ])
              }}>@{member.name}</button>
          )}</For>
        </div>
      </Show>
      <Show when={error()}><p id={`${listId}-error`} role="alert" class="mb-2 text-xs text-stone-700">{error()}</p></Show>
      <Show when={open()}>
        <div id={listId} role="listbox" aria-label={query()?.kind === 'mention' ? 'Mention a bot' : 'Commands'}
          class="absolute z-20 max-h-56 w-80 max-w-full overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-1 shadow-sm [scrollbar-gutter:stable]"
          style={{ left: `${position().left}px`, bottom: `${position().bottom}px` }}>
          <For each={choices()}>{(choice, index) => (
            <div id={`${listId}-${index()}`} role="option" aria-selected={active() === index()}
              class={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm ${active() === index() ? 'bg-stone-200 text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index())}
              onClick={() => choose(choice)}>
              <Show when={choice.bot} keyed>{(bot) => <BotAvatar bot={bot} class="h-7 w-7 text-xs" />}</Show>
              <div class="min-w-0"><div class="truncate">{choice.part.text}</div><Show when={choice.description}><div class="text-xs text-stone-500">{choice.description}</div></Show></div>
            </div>
          )}</For>
        </div>
      </Show>
      <div class="flex items-end gap-2">
        <div class="relative min-w-0 flex-1">
          <Show when={!composerText(parts())}><span aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-2 text-sm text-stone-400">{props.group ? 'Message the crew… type @ or /' : `Message ${props.title ?? 'a bot'}… type @ or /`}</span></Show>
          <div ref={editor} role="textbox" aria-label={props.group ? 'Message the crew' : `Message ${props.title ?? 'a bot'}`}
            aria-multiline="true" aria-autocomplete="list" aria-controls={open() ? listId : undefined}
            aria-activedescendant={open() ? `${listId}-${active()}` : undefined}
            aria-describedby={`${listId}-hint${error() ? ` ${listId}-error` : ''}`}
            aria-disabled={!props.onSend || submitting()} aria-busy={busy()}
            contentEditable={!!props.onSend && !submitting()} tabIndex={0}
            class="max-h-48 min-h-10 overflow-y-auto whitespace-pre-wrap break-words rounded-md py-2 text-sm leading-6 text-stone-600 outline-none [scrollbar-gutter:stable]"
            onFocus={updateSuggestions} onBlur={() => setQuery(null)} onScroll={updateSuggestions}
            onCompositionStart={() => { composing = true; setQuery(null) }}
            onCompositionEnd={() => { composing = false; readInput() }}
            onInput={readInput}
            onBeforeInput={(event) => {
              if (composing || event.isComposing) return
              if (submitting() || !props.onSend) { event.preventDefault(); return }
              if (event.inputType === 'insertText' && event.data !== null) {
                event.preventDefault()

                insert([{ kind: 'text', text: event.data }])
              } else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
                event.preventDefault()
                if (event.inputType === 'insertParagraph') void send()
                else insert([{ kind: 'text', text: '\n' }])
              } else if (event.inputType.startsWith('delete')) {
                event.preventDefault()
                deleteSelection(event.inputType.endsWith('Backward'), event.inputType.includes('Word'))
              } else if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
                event.preventDefault()
                history(event.inputType === 'historyUndo')
              } else event.preventDefault()
            }}
            onPaste={(event) => {
              event.preventDefault()
              if (!submitting() && props.onSend && !composing) insert([{ kind: 'text', text: event.clipboardData?.getData('text/plain').replace(/\r\n?/g, '\n') ?? '' }])
            }}
            onDrop={(event) => event.preventDefault()}
            onCopy={(event) => {
              const current = selection()
              if (!current || current.start === current.end) return
              event.preventDefault()
              const range = atomicRange(parts(), current.start, current.end)
              event.clipboardData?.setData('text/plain', composerText(parts()).slice(range.start, range.end))
            }}
            onCut={(event) => {
              event.preventDefault()
              if (submitting() || composing) return
              const current = selection()
              if (!current || current.start === current.end) return
              const range = atomicRange(parts(), current.start, current.end)
              event.clipboardData?.setData('text/plain', composerText(parts()).slice(range.start, range.end))
              replace(range.start, range.end, [])
            }}
            onKeyDown={(event) => {
              if (composing || event.isComposing || event.keyCode === 229) return
              if (event.key === 'Escape') { event.preventDefault(); dismissed = JSON.stringify(query()); setQuery(null); return }
              if (open() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault()
                const next = (active() + (event.key === 'ArrowDown' ? 1 : -1) + choices().length) % choices().length
                setActive(next)
                document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' })
                return
              }
              if (open() && (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey))) {
                event.preventDefault()
                const choice = choices()[active()]
                if (choice) choose(choice)
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                if (submitting() || !props.onSend) return
                if (event.shiftKey) insert([{ kind: 'text', text: '\n' }])
                else { tokenize(); void send() }
              } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault()
                if (!submitting()) history(!event.shiftKey)
              } else if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault()
                if (!submitting()) deleteSelection(event.key === 'Backspace', event.altKey || event.ctrlKey || event.metaKey)
              }
            }} />
        </div>
        <button type="submit" disabled={busy() || !composerText(parts()).trim() || !props.onSend}
          class="mb-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-stone-900 text-white hover:bg-stone-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-default disabled:opacity-40" title="Send" aria-label="Send">
          <ArrowUp class="h-4 w-4" />
        </button>
      </div>
      <p id={`${listId}-hint`} class="mt-1 text-xs text-stone-400">@ mention · / command · Shift+Enter for a new line</p>
    </form>
  )
}
