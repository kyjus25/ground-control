import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { authorizeThreadStorage, createThreadStorage } from './storage'
import * as v from 'valibot'
import { SaveThreadSkillSchema, ThreadStorageSchema, UpdateThreadMemorySchema } from '../types/storage-schemas'
import { createSkillFiles } from './skill-files'
import { createSpeakerStorage } from './speaker-storage'
import { hasSkillGrant, normalizeSkills } from '../types/skill'

const botId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const groupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
let temporary: string
beforeEach(async () => { temporary = await realpath(await mkdtemp(join(tmpdir(), 'gc-m4-'))) })
afterEach(async () => { await rm(temporary, { recursive: true, force: true }) })

function fixture() {
  const state = { member: true, grants: '["Memory write"]', owner: true, threadOwner: true }
  const connection = drizzle(async (sql, params) => {
    if (sql.includes('from "bots"')) {
      if (sql.includes('"skills"')) return { rows: state.owner ? [[state.grants]] : [] }
      return { rows: state.owner && params[1] === userId && [botId, otherId].includes(String(params[0])) ? [[params[0]]] : [] }
    }
    return { rows: params[0] === groupId && state.threadOwner && (!sql.includes('inner join') || state.member) ? [[groupId]] : [] }
  })
  const storage = createThreadStorage({ dataRoot: join(temporary, 'data') })
  const skills = createSkillFiles(storage)
  const speaker = (threadId: string, id = botId) => createSpeakerStorage({ userId, botId: id, threadId }, { connection, storage, skills })
  return { state, connection, storage, skills, speaker }
}

test('viewer authorization and API schemas reject foreign threads, invalid UUIDs and paths', async () => {
  const { connection, state } = fixture()
  expect(await authorizeThreadStorage(connection, userId, botId)).toBe(botId)
  expect(await authorizeThreadStorage(connection, userId, groupId)).toBe(groupId)
  state.threadOwner = false
  await expect(authorizeThreadStorage(connection, userId, groupId)).rejects.toThrow()
  state.owner = false
  await expect(authorizeThreadStorage(connection, userId, botId)).rejects.toThrow()
  expect(() => v.parse(ThreadStorageSchema, { threadId: '../escape' })).toThrow()
  expect(() => v.parse(UpdateThreadMemorySchema, { threadId: botId, content: 'x' })).toThrow()
  expect(() => v.parse(SaveThreadSkillSchema, { threadId: botId, name: '../x.md', content: 'x' })).toThrow()
})

test('tool execution and model turns have independent hard limits', async () => {
  const { speaker } = fixture()
  const session = await speaker(botId)
  for (let index = 0; index < 12; index++) await session.tools[0]!.execute!({ scope: 'self' })
  await expect(session.tools[0]!.execute!({ scope: 'self' })).rejects.toThrow('limit')
  expect(session.agentLoopStrategy({ iterationCount: 4, messages: [], finishReason: 'tool_calls', lastTurnToolCallCount: 1, toolCallCount: 4 })).toBe(false)
})

test('stable grants normalize legacy labels without enabling unavailable tools', () => {
  expect(normalizeSkills('["Memory write","memory-write","Browser","unknown"]')).toEqual(['memory-write', 'browser'])
  expect(hasSkillGrant('[]', 'memory-read')).toBe(true)
  expect(hasSkillGrant('["Browser"]', 'browser')).toBe(false)
  expect(hasSkillGrant('not json', 'memory-write')).toBe(false)
})

test('speaker gets full own/group data, persistent scoped tools, and fresh grants at execution', async () => {
  const { storage, skills, speaker, state } = fixture()
  await storage.appendMemory(botId, 'private memory')
  await storage.appendMemory(otherId, 'other private memory')
  await storage.appendMemory(groupId, 'group memory')
  await skills.save(botId, 'research.md', 'Private research instructions')
  const session = await speaker(groupId)
  const prompt = session.systemPrompts.join('\n')
  expect(prompt).toContain('private memory')
  expect(prompt).toContain('group memory')
  expect(prompt).toContain('Private research instructions')
  expect(prompt).toContain('untrusted')
  expect(prompt).not.toContain('other private memory')
  expect(session.tools.map((tool) => tool.name)).toEqual(['memory_read', 'memory_append'])
  expect(await session.read({ scope: 'self' })).toMatchObject({ content: 'private memory' })
  await session.append({ scope: 'thread', content: '\nremembered' })
  expect((await storage.readMemory(groupId)).content).toBe('group memory\nremembered')
  state.grants = '[]'
  await expect(session.append({ scope: 'self', content: 'denied' })).rejects.toThrow()
  expect((await speaker(groupId)).tools.map((tool) => tool.name)).toEqual(['memory_read'])
  state.member = false
  await expect(session.read({ scope: 'thread' })).rejects.toThrow()
  await expect(session.read({ scope: 'self', path: otherId })).rejects.toThrow()
  state.owner = false
  await expect(session.read({ scope: 'self' })).rejects.toThrow()
})

test('outsider handoffs see own data only in direct and group threads', async () => {
  const { storage, speaker, state } = fixture()
  await storage.appendMemory(botId, 'own')
  await storage.appendMemory(otherId, 'never direct')
  await storage.appendMemory(groupId, 'never group')
  state.member = false
  for (const threadId of [otherId, groupId]) {
    const session = await speaker(threadId)
    expect(session.systemPrompts.join('\n')).toContain('own')
    expect(session.systemPrompts.join('\n')).not.toContain('never')
    await expect(session.read({ scope: 'thread' })).rejects.toThrow()
    await expect(session.append({ scope: 'thread', content: 'denied' })).rejects.toThrow()
  }
  state.threadOwner = false
  await expect(speaker(groupId)).rejects.toThrow()
})

test('skill files persist CRUD and reject traversal, symlinks and oversized content', async () => {
  const { storage, skills } = fixture()
  await skills.save(botId, 'research.md', '# Research\nCheck sources')
  expect(await createSkillFiles(storage).list(botId)).toEqual([{ name: 'research.md', content: '# Research\nCheck sources' }])
  expect(await skills.get(botId, 'research.md')).toEqual({ name: 'research.md', content: '# Research\nCheck sources' })
  await skills.save(botId, 'research.md', 'Updated')
  expect((await skills.get(botId, 'research.md')).content).toBe('Updated')
  for (const name of ['../escape.md', '/tmp/escape.md', 'code.js', 'x/y.md', '.hidden.md', 'UPPER.md']) {
    await expect(skills.save(botId, name, 'bad')).rejects.toThrow()
    await expect(skills.delete(botId, name)).rejects.toThrow()
  }
  await expect(skills.save(botId, 'big.md', 'é'.repeat(16384))).rejects.toThrow()
  const layout = await storage.initialize(botId)
  const outside = join(temporary, 'outside.md')
  await writeFile(outside, 'secret')
  await symlink(outside, join(layout.skills, 'linked.md'))
  await expect(skills.get(botId, 'linked.md')).rejects.toThrow()
  await expect(skills.save(botId, 'linked.md', 'changed')).rejects.toThrow()
  await expect(skills.delete(botId, 'linked.md')).rejects.toThrow()
  await expect(skills.list(botId)).rejects.toThrow()
  await rm(join(layout.skills, 'linked.md'))
  await skills.delete(botId, 'research.md')
  expect(await skills.list(botId)).toEqual([])
})
