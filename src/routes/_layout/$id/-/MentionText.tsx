import { For, Show, createMemo } from 'solid-js'
import { SolidMarkdown } from 'solid-markdown'
import type { Element, Root } from 'hast'

type MentionProps = { text: string; members: readonly { name: string }[] }
type MentionPart = { text: string; mention: boolean }

export function splitMentions(text: string, members: MentionProps['members']): MentionPart[] {
  const names = [...new Set(members.map((member) => member.name.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!names.length) return [{ text, mention: false }]

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}\\p{M}_@.+%/\\-])@(?:${names.join('|')})(?![\\p{L}\\p{N}\\p{M}_@\\-]|\\.[\\p{L}\\p{N}\\p{M}_])`,
    'giu',
  )
  const parts: MentionPart[] = []
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index), mention: false })
    parts.push({ text: match[0], mention: true })
    offset = match.index + match[0].length
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), mention: false })
  return parts
}

export function rehypeMentions(members: MentionProps['members']) {
  return (tree: Root) => {
    const walk = (parent: Root | Element) => {
      for (let index = 0; index < parent.children.length; index++) {
        const child = parent.children[index]
        if (child.type === 'element') {
          if (!['code', 'pre', 'a'].includes(child.tagName)) walk(child)
        } else if (child.type === 'text') {
          const parts = splitMentions(child.value, members)
          if (!parts.some((part) => part.mention)) continue
          const nodes = parts.map((part): Element | { type: 'text'; value: string } =>
            part.mention
              ? {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['font-medium', 'text-green-700'] },
                  children: [{ type: 'text', value: part.text }],
                }
              : { type: 'text', value: part.text },
          )
          parent.children.splice(index, 1, ...nodes)
          index += nodes.length - 1
        }
      }
    }
    walk(tree)
  }
}

export function MentionText(props: MentionProps) {
  const parts = createMemo(() => splitMentions(props.text, props.members))
  return (
    <For each={parts()}>
      {(part) => (
        <Show when={part.mention} fallback={part.text}>
          <span class="font-medium text-green-700">{part.text}</span>
        </Show>
      )}
    </For>
  )
}

export function MessageContent(props: MentionProps & { markdown?: boolean }) {
  return (
    <Show when={props.markdown} fallback={<MentionText text={props.text} members={props.members} />}>
      <SolidMarkdown rehypePlugins={[[rehypeMentions, props.members]]}>{props.text}</SolidMarkdown>
    </Show>
  )
}
