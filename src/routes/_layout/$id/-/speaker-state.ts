import type { StreamChunk } from '@tanstack/ai'

export function replyingSpeaker<T extends { id: string; name: string }>(current: T | null, chunk: StreamChunk, roster: readonly T[]): T | null {
  if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') return null
  if (chunk.type !== 'CUSTOM') return current
  if (chunk.name !== 'speaker-start' && chunk.name !== 'speaker' && chunk.name !== 'speaker-end') return current
  if (!chunk.value || typeof chunk.value !== 'object') return current
  const value = chunk.value as { botId?: unknown; name?: unknown }
  if (chunk.name === 'speaker-end') return current?.id === value.botId ? null : current
  return roster.find((member) => member.id === value.botId)
    ?? (typeof value.name === 'string' ? roster.find((member) => member.name.toLowerCase() === (value.name as string).toLowerCase()) : undefined)
    ?? null
}
