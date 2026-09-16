import { describe, expect, test } from 'bun:test'
import { EventType, StreamProcessor } from '@tanstack/ai/client'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import {
  canResumeRun,
  contextFor,
  mentionedBots,
  positiveIntEnv,
  runReplyChain,
  streamSpeakerReply,
  systemPromptsFor,
  type ChatBot,
  type ChatThread,
} from './chat-helpers'

const ben: ChatBot = { id: 'ben', userId: 'owner', name: 'Ben', modelId: 'mock', soul: 'Patient and curious.', instructions: 'Ask clarifying questions.' }
const scout: ChatBot = { ...ben, id: 'scout', name: 'Scout', soul: 'Research carefully.', instructions: 'Cite findings.' }
const ann: ChatBot = { ...ben, id: 'ann', name: 'Ann' }
const fourth: ChatBot = { ...ben, id: 'fourth', name: 'Fourth' }
const foreign: ChatBot = { ...ben, id: 'foreign', userId: 'other-owner', name: 'Private', soul: 'Secret SOUL.' }
const direct: ChatThread = { name: 'Ben', primaryBotId: ben.id, memberIds: [ben.id] }
const group: ChatThread = { name: 'Crew', memberIds: [ben.id, scout.id] }
const roster = [ben, scout, ann, fourth, foreign]

async function* modelStream(text: string): AsyncIterable<StreamChunk> {
  yield { type: EventType.RUN_STARTED, runId: 'provider-run', threadId: 'provider-thread' }
  yield { type: EventType.TEXT_MESSAGE_START, messageId: 'provider-message', role: 'assistant' }
  yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'provider-message', delta: text }
  yield { type: EventType.TEXT_MESSAGE_END, messageId: 'provider-message' }
  yield { type: EventType.RUN_FINISHED, runId: 'provider-run', threadId: 'provider-thread' }
}

async function turn(thread: ChatThread, text: string, replies: Record<string, string>) {
  const emitted: StreamChunk[] = []
  const persisted: Array<{ id: string; content: string; senderBotId: string }> = []
  const calls: Array<{ speaker: ChatBot; messages: ModelMessage[]; systemPrompts: string[]; optional: boolean; buffer: boolean }> = []
  const custom: unknown[] = []
  const processor = new StreamProcessor({ events: { onCustomEvent: (name, value) => {
    if (name === 'speaker') custom.push(value)
  } } })
  const emit = async (chunks: StreamChunk[]) => {
    emitted.push(...chunks)
    for (const chunk of chunks) processor.processChunk(chunk)
  }
  await emit([{ type: EventType.RUN_STARTED, runId: 'run', threadId: 'thread' }])
  await runReplyChain({
    userId: 'owner', roster, thread, text,
    history: [{ senderType: 'user', senderBotId: null, content: text }],
    generate: async (speaker, messages, systemPrompts, optional, buffer) => {
      calls.push({ speaker, messages, systemPrompts, optional, buffer })
      return streamSpeakerReply({
        speaker,
        source: modelStream(replies[speaker.id] ?? 'Done.'),
        emit,
        persist: async (message) => { persisted.push({ ...message, senderBotId: speaker.id }) },
        buffer,
      })
    },
  })
  await emit([{ type: EventType.RUN_FINISHED, runId: 'run', threadId: 'thread' }])
  return { calls, emitted, persisted, custom, messages: processor.getMessages() }
}

describe('chat loop-guard env parsing', () => {
  test('positiveIntEnv: positive ints parsed; unset, garbage, zero and negatives fall back', () => {
    const cases: Array<[string | undefined, number]> = [
      ['5', 5], ['12', 12], ['  8  ', 8],
      ['0', 7], ['-2', 7], ['abc', 7], ['2.7', 2],
    ]
    for (const [raw, expected] of cases) {
      if (raw === undefined) delete process.env.GC_TEST_VALUE
      else process.env.GC_TEST_VALUE = raw
      expect(positiveIntEnv('GC_TEST_VALUE', 7)).toBe(expected)
    }
    delete process.env.GC_TEST_VALUE
  })
})

describe('chat prompts and ownership', () => {
  test('direct and group prompts always include identity, SOUL, instructions and only owner roster', () => {
    for (const thread of [direct, group]) {
      const prompt = systemPromptsFor(ben, thread, roster).join('\n')
      expect(prompt).toContain('You are Ben')
      expect(prompt).toContain('SOUL:\nPatient and curious.')
      expect(prompt).toContain('Instructions:\nAsk clarifying questions.')
      expect(prompt).toContain('@Scout')
      expect(prompt).toContain('@Ann')
      expect(prompt).not.toContain('Private')
      expect(prompt).not.toContain('Secret SOUL')
      expect(prompt).not.toContain(scout.soul!)
    }
  })

  test('identity and roster survive empty customization', () => {
    const prompt = systemPromptsFor({ ...ben, soul: null, instructions: '' }, direct, roster).join('\n')
    expect(prompt).toContain('You are Ben')
    expect(prompt).toContain('No SOUL configured.')
    expect(prompt).toContain('No additional instructions configured.')
    expect(prompt).toContain('@Scout')
  })

  test('resume requires both owner and thread match', () => {
    const run = { userId: 'owner', threadId: 'thread' }
    expect(canResumeRun(run, 'owner', 'thread')).toBe(true)
    expect(canResumeRun(run, 'other-owner', 'thread')).toBe(false)
    expect(canResumeRun(run, 'owner', 'other-thread')).toBe(false)
  })

  test('context distinguishes self, other bots and missing senders', () => {
    expect(contextFor(ben.id, [
      { senderType: 'user', senderBotId: null, content: 'Hello' },
      { senderType: 'bot', senderBotId: ben.id, content: 'My reply' },
      { senderType: 'bot', senderBotId: scout.id, content: 'Research' },
      { senderType: 'bot', senderBotId: foreign.id, content: 'Old message' },
    ], new Map([[scout.id, scout.name]]))).toEqual([
      { role: 'user', content: 'User: Hello' },
      { role: 'assistant', content: 'My reply' },
      { role: 'user', content: 'Scout: Research' },
      { role: 'user', content: 'Unknown: Old message' },
    ])
  })
})

describe('reply routing and streaming attribution', () => {
  test('direct starts primary then hands off outside thread; metadata survives completion', async () => {
    const result = await turn(direct, '@Scout help', { ben: '@Scout research this', scout: 'Found it.' })
    expect(result.calls.map((call) => call.speaker.id)).toEqual(['ben', 'scout'])
    expect(result.calls[1].messages.at(-1)).toEqual({ role: 'user', content: 'Ben: @Scout research this' })
    expect(result.messages).toHaveLength(2)
    for (const [index, speaker] of [ben, scout].entries()) {
      const message = result.messages[index]
      expect(message.metadata).toMatchObject({ senderBotId: speaker.id, name: speaker.name })
      expect(message.id).toBe(result.persisted[index].id)
      expect(result.persisted[index].senderBotId).toBe(speaker.id)
      expect(result.custom[index]).toEqual({ messageId: message.id, botId: speaker.id, senderBotId: speaker.id, name: speaker.name })
      expect(result.emitted.find((chunk) => chunk.type === 'TEXT_MESSAGE_START' && chunk.messageId === message.id)).toMatchObject({
        role: 'assistant', name: speaker.name, metadata: { senderBotId: speaker.id, name: speaker.name },
      })
    }
    expect(new Set(result.messages.map((message) => message.id)).size).toBe(2)
    expect(result.emitted.filter((chunk) => chunk.type === 'RUN_FINISHED')).toHaveLength(1)
    expect(result.emitted.filter((chunk) => chunk.type === 'RUN_STARTED')).toHaveLength(1)
  })

  test('group initially routes only members in mention order, handoffs use owner roster', async () => {
    const result = await turn(group, '@Private @Ann @Scout @Ben', { scout: '@Ann help', ben: 'Ready', ann: 'Assisting' })
    expect(result.calls.map((call) => call.speaker.id)).toEqual(['scout', 'ben', 'ann'])
    expect(result.calls[2].messages).toContainEqual({ role: 'user', content: 'Scout: @Ann help' })
    expect(result.messages.map((message) => message.metadata?.name)).toEqual(['Scout', 'Ben', 'Ann'])
    expect(result.custom).toHaveLength(3)
    expect(result.messages.map((message) => message.id)).toEqual(result.persisted.map((message) => message.id))
  })

  test('depth cap and answered set stop loops and never route to other owners', async () => {
    const result = await turn(direct, 'Go', {
      ben: '@Scout @Private', scout: '@Ben @Ann', ann: '@Fourth @Scout',
    })
    expect(result.calls.map((call) => call.speaker.id)).toEqual(['ben', 'scout', 'ann'])
  })

  test('no group mention gives no bot response, and foreign primary never responds', async () => {
    expect((await turn(group, 'Hello @Ann @Private', {})).calls).toEqual([])
    expect((await turn({ ...direct, primaryBotId: foreign.id }, 'Hello', {})).calls).toEqual([])
  })

  test('untagged group turn invites all members in random order, first required, later pass', async () => {
    const replies: Record<string, string> = { ben: 'First reply.', scout: 'Second opinion.' }
    const repliesFor = (id: string) => replies[id] ?? 'Done.'
    const calls = await Promise.all(
      Array.from({ length: 24 }, () => turn(group, 'Just thinking out loud.', replies)),
    )
    for (const result of calls) {
      expect(result.calls).toHaveLength(2)
      const [firstCall, secondCall] = result.calls
      expect(firstCall.systemPrompts.at(-1)).toContain('first responder')
      expect(secondCall.speaker.id).not.toBe(firstCall.speaker.id)
      expect(secondCall.systemPrompts.at(-1)).toContain('optional contributor')
      expect(secondCall.systemPrompts.at(-1)).toContain('[[PASS]]')
      expect(secondCall.messages.at(-1)).toEqual({ role: 'user', content: `${firstCall.speaker.name}: ${repliesFor(firstCall.speaker.id)}` })
      const expectedReplies = 1 + (replies[secondCall.speaker.id] !== undefined ? 1 : 0)
      expect(result.messages).toHaveLength(expectedReplies)
      expect(result.messages[0].metadata?.name).toBe(firstCall.speaker.name)
    }
    const starters = new Set(calls.map((result) => result.calls[0].speaker.id))
    expect(starters.size).toBe(2)
    const withPass: Record<string, string> = { ben: 'Covering it.', scout: '[[PASS]]' }
    const benStarted = await turn(group, 'Nothing to add?', withPass)
    if (benStarted.calls[0].speaker.id === 'ben') {
      expect(benStarted.calls.map((call) => call.speaker.id)).toEqual(['ben', 'scout'])
      expect(benStarted.messages).toHaveLength(1)
      expect(benStarted.persisted).toHaveLength(1)
      expect(benStarted.persisted[0].content).toBe('Covering it.')
    } else {
      // Scout (required) ignored the prompt and passed: its reply is dropped
      // and the mic hands to Ben, whose reply is the turn's only message.
      expect(benStarted.calls.map((call) => call.speaker.id)).toEqual(['scout', 'ben'])
      expect(benStarted.messages).toHaveLength(1)
      expect(benStarted.messages[0].metadata?.name).toBe('Ben')
      expect(benStarted.persisted).toHaveLength(1)
      expect(benStarted.persisted[0].content).toBe('Covering it.')
    }
    const mentioned = await turn(group, '@Scout only you', { scout: 'On it.' })
    expect(mentioned.calls.map((call) => call.speaker.id)).toEqual(['scout'])
  })

  test('unconfigured bots sit out without blocking other queued responders', async () => {
    const calls: string[] = []
    await runReplyChain({
      userId: 'owner', roster: [{ ...ben, modelId: null }, scout], thread: group,
      text: '@Ben @Scout', history: [],
      generate: async (speaker) => { calls.push(speaker.id); return 'Done' },
    })
    expect(calls).toEqual(['scout'])
  })

  test('provider failure is propagated, not treated as a successful handoff', async () => {
    const emitted: StreamChunk[] = []
    const persisted: unknown[] = []
    await expect(streamSpeakerReply({
      speaker: ben,
      source: (async function* (): AsyncIterable<StreamChunk> {
        yield { type: EventType.RUN_ERROR, message: 'Mock failure' }
      })(),
      emit: async (chunks) => { emitted.push(...chunks) },
      persist: async (message) => { persisted.push(message) },
    })).rejects.toThrow('Mock failure')
    expect(persisted).toEqual([])
  })
})

test('mentions respect boundaries, full names, literal punctuation and first occurrence order', () => {
  const names = [ann, { ...ann, id: 'ann-lee', name: 'Ann Lee' }, scout, { ...ben, name: 'C++' }]
  expect(mentionedBots('@Ann Lee, @SCOUT @Ann @Scout @C++', names).map((bot) => bot.name)).toEqual(['Ann Lee', 'Scout', 'Ann', 'C++'])
  expect(mentionedBots('person@Scout.com @@Scout @Scouting @Scout_extra @Scout-bot @Scouté', names)).toEqual([])
})
