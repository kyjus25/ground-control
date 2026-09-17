import type { ThreadMember } from './Thread'

export type ChatCommand = 'clear' | 'compact'
export type ComposerPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; botId: string }
  | { kind: 'command'; text: string; command: ChatCommand }

export const COMMANDS: readonly { command: ChatCommand; description: string }[] = [
  { command: 'clear', description: 'Delete this conversation’s history' },
  { command: 'compact', description: 'Summarize context, keeping the transcript' },
]

export function composerText(parts: readonly ComposerPart[]) {
  return parts.map((part) => part.text).join('')
}

export function normalizeParts(parts: readonly ComposerPart[]): ComposerPart[] {
  const result: ComposerPart[] = []
  for (const part of parts) {
    if (!part.text) continue
    const previous = result.at(-1)
    if (part.kind === 'text' && previous?.kind === 'text') previous.text += part.text
    else result.push({ ...part })
  }
  return result
}

export function atomicRange(parts: readonly ComposerPart[], start: number, end: number) {
  let offset = 0
  for (const part of parts) {
    const next = offset + part.text.length
    if (part.kind !== 'text') {
      if (start > offset && start < next) start = offset
      if (end > offset && end < next) end = next
    }
    offset = next
  }
  return { start, end }
}

export function replaceParts(parts: readonly ComposerPart[], start: number, end: number, replacement: readonly ComposerPart[]) {
  const range = atomicRange(parts, start, end)
  const before: ComposerPart[] = []
  const after: ComposerPart[] = []
  let offset = 0
  for (const part of parts) {
    const next = offset + part.text.length
    if (next <= range.start) before.push(part)
    else if (offset < range.start) before.push({ kind: 'text', text: part.text.slice(0, range.start - offset) })
    if (offset >= range.end) after.push(part)
    else if (next > range.end) after.push({ kind: 'text', text: part.text.slice(range.end - offset) })
    offset = next
  }
  return {
    parts: normalizeParts([...before, ...replacement, ...after]),
    caret: range.start + composerText(replacement).length,
  }
}

export function parseSubmission(parts: readonly ComposerPart[]):
  | { kind: 'empty' }
  | { kind: 'message'; text: string }
  | { kind: 'command'; command: ChatCommand }
  | { kind: 'error'; message: string } {
  const text = composerText(parts).trim()
  if (!text) return { kind: 'empty' }
  const exact = COMMANDS.find(({ command }) => text === `/${command}`)
  if (exact) return { kind: 'command', command: exact.command }
  if (parts.some((part) => part.kind === 'command') || /(^|\s)\/(clear|compact)(?=\s|$)/u.test(text)) {
    return { kind: 'error', message: 'Send one command on its own, without other text or mentions.' }
  }
  if (text.startsWith('/')) return { kind: 'error', message: 'Unknown command. Choose /clear or /compact.' }
  return { kind: 'message', text }
}

export function suggestionQuery(parts: readonly ComposerPart[], caret: number) {
  let offset = 0
  for (const part of parts) {
    const end = offset + part.text.length
    if (part.kind === 'text' && caret > offset && caret <= end) {
      const prefix = part.text.slice(0, caret - offset)
      const match = /(?:^|\s)(@([^@/\n]*)|\/([^\s/]*))$/u.exec(prefix)
      if (!match) return null
      const value = match[1]!
      if (value[0] === '/' && caret - value.length !== 0) return null
      return { kind: value[0] === '@' ? 'mention' as const : 'command' as const, query: value.slice(1), start: caret - value.length, end: caret }
    }
    offset = end
  }
  return null
}

export function completedToken(parts: readonly ComposerPart[], caret: number, bots: readonly ThreadMember[]) {
  let offset = 0
  for (const part of parts) {
    const end = offset + part.text.length
    if (part.kind === 'text' && caret > offset && caret <= end) {
      const prefix = part.text.slice(0, caret - offset)
      const candidates: ComposerPart[] = [
        ...bots.map((bot): ComposerPart => ({ kind: 'mention', text: `@${bot.name}`, botId: bot.id })),
        ...COMMANDS.map(({ command }): ComposerPart => ({ kind: 'command', text: `/${command}`, command })),
      ]
      for (const candidate of candidates.sort((a, b) => b.text.length - a.text.length)) {
        const start = prefix.length - candidate.text.length
        if (start < 0 || (start > 0 && !/\s/u.test(prefix[start - 1]!))) continue
        if (candidate.kind === 'command' && offset + start !== 0) continue
        if (prefix.slice(start).toLowerCase() === candidate.text.toLowerCase()) {
          return { part: candidate, start: offset + start, end: caret }
        }
      }
    }
    offset = end
  }
  return null
}
