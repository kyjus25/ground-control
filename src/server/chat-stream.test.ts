import { expect, test } from 'bun:test'
import { EventType, resumeServerSentEventsResponse, type StreamChunk, type StreamDurability } from '@tanstack/ai'
import { durableChatResponse, produceChatRun } from './chat-stream'
import { replyingSpeaker } from '../routes/_layout/$id/-/speaker-state'

function fixture() {
  const chunks: StreamChunk[] = []
  let open = true
  let readers = 0
  const adapter = {
    resumeFrom: () => '-1',
    append: async (batch) => batch.map((chunk) => { chunks.push(chunk); return `fixture:${chunks.length - 1}` }),
    close: async () => { open = false },
    read: async function* (offset, signal) {
      readers++
      let next = offset === '-1' ? 0 : Number(offset.split(':')[1]) + 1
      try {
        while (!signal?.aborted) {
          while (next < chunks.length) {
            yield { offset: `fixture:${next}`, chunk: chunks[next++]! }
          }
          if (!open) return
          await Bun.sleep(5)
        }
      } finally {
        readers--
      }
    },
    snapshot: async () => chunks.map((chunk, index) => ({ offset: `fixture:${index}`, chunk })),
  } satisfies StreamDurability
  return { adapter, chunks, readers: () => readers }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test('POST emits repeated heartbeat bytes during silence, then terminal with resumable offsets', async () => {
  const { adapter, chunks } = fixture()
  const gate = deferred()
  const producer = produceChatRun({ adapter, runId: 'fixture', threadId: 'thread', produce: () => gate.promise, report: () => {} })
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: (request) => durableChatResponse(adapter, request.signal, 20) })
  try {
    const response = await fetch(server.url, { method: 'POST' })
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    let wire = ''
    while (wire.split(': heartbeat').length < 4) {
      const { value, done } = await reader.read()
      expect(done).toBe(false)
      wire += new TextDecoder().decode(value)
    }
    expect(wire).toContain('id: fixture:0')
    expect(wire).not.toContain('RUN_FINISHED')
    gate.resolve()
    await producer
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      wire += new TextDecoder().decode(value)
    }
    expect(wire).toContain('RUN_FINISHED')
    expect(chunks.map((chunk) => chunk.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
    const replay = await resumeServerSentEventsResponse({ adapter: { ...adapter, resumeFrom: () => 'fixture:0' } }).text()
    expect(replay).not.toContain('RUN_STARTED')
    expect(replay).toContain('id: fixture:1')
  } finally {
    gate.resolve()
    await producer
    server.stop(true)
  }
})

test('delivery cancellation stops its reader without killing producer or replay', async () => {
  const { adapter, chunks, readers } = fixture()
  const gate = deferred()
  const producer = produceChatRun({ adapter, runId: 'fixture', threadId: 'thread', produce: () => gate.promise, report: () => {} })
  const response = durableChatResponse(adapter, undefined, 20)
  const reader = response.body!.getReader()
  await reader.read()
  await reader.cancel()
  expect(readers()).toBe(0)
  gate.resolve()
  await producer
  expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  expect(await durableChatResponse(adapter).text()).toContain('RUN_FINISHED')
})

test('producer exceptions become generic terminal events and cleanup failures are handled', async () => {
  const { adapter, chunks } = fixture()
  const phases: string[] = []
  await produceChatRun({ adapter, runId: 'fixture', threadId: 'thread', produce: async () => { throw new Error('PRIVATE TOOL PAYLOAD') }, report: (phase) => { phases.push(phase) } })
  expect(chunks.at(-1)?.type).toBe(EventType.RUN_ERROR)
  expect(JSON.stringify(chunks)).not.toContain('PRIVATE')
  expect(phases).toEqual(['generation'])
  await produceChatRun({
    adapter: { ...adapter, append: async () => { throw new Error('database unavailable') }, close: async () => { throw new Error('close failed') } },
    runId: 'fixture', threadId: 'thread', produce: async () => {}, report: (phase) => { phases.push(phase) },
  })
  expect(phases).toEqual(['generation', 'generation', 'terminal', 'close'])
})

test('speaker lifecycle names each bot, clears stale turns, and ignores private events', () => {
  const ben = { id: 'ben', name: 'Ben' }
  const scout = { id: 'scout', name: 'Scout' }
  const roster = [ben, scout]
  let current = replyingSpeaker(null, { type: EventType.CUSTOM, name: 'speaker-start', value: { botId: 'ben' } }, roster)
  expect(current).toBe(ben)
  current = replyingSpeaker(current, { type: EventType.CUSTOM, name: 'speaker-start', value: { botId: 'scout' } }, roster)
  expect(current).toBe(scout)
  expect(replyingSpeaker(current, { type: EventType.CUSTOM, name: 'speaker-end', value: { botId: 'ben' } }, roster)).toBe(scout)
  expect(replyingSpeaker(current, { type: EventType.CUSTOM, name: 'speaker-end', value: { botId: 'scout' } }, roster)).toBeNull()
  expect(replyingSpeaker(current, { type: EventType.RUN_STARTED, runId: 'next', threadId: 'thread' }, roster)).toBeNull()
  expect(replyingSpeaker(current, { type: EventType.CUSTOM, name: 'private', value: { botId: 'ben' } }, roster)).toBe(scout)
})
