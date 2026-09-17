import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/pg-proxy'
import {
  authorizeStorageScope,
  createThreadStorage,
  DEFAULT_MAX_MEMORY_BYTES,
  StorageError,
  validateStorageUUID,
  type StorageErrorCode,
} from './storage'

const botId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherBotId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const groupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const foreignUserId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
let temporary: string
let dataRoot: string

beforeEach(async () => {
  temporary = await realpath(await mkdtemp(join(tmpdir(), 'gc-storage-test-')))
  dataRoot = join(temporary, 'data')
})

afterEach(async () => {
  await rm(temporary, { recursive: true, force: true })
})

async function rejectsCode(operation: () => unknown, code: StorageErrorCode) {
  try {
    await operation()
  } catch (error) {
    expect(error).toBeInstanceOf(StorageError)
    expect((error as StorageError).code).toBe(code)
    return
  }
  throw new Error(`Expected ${code}`)
}

describe('thread storage layout', () => {
  test('is lazy, uses fixed layout and canonical UUIDs, and preserves existing content', async () => {
    const storage = createThreadStorage({ dataRoot })
    expect(await readdir(temporary)).toEqual([])
    const layout = await storage.initialize(botId.toUpperCase())
    expect(layout).toEqual({
      threadId: botId,
      root: join(dataRoot, botId),
      workspaces: join(dataRoot, botId, 'workspaces'),
      skills: join(dataRoot, botId, 'skills'),
      memory: join(dataRoot, botId, 'MEMORY.md'),
    })
    expect((await lstat(layout.root)).mode & 0o777).toBe(0o700)
    expect((await lstat(layout.memory)).mode & 0o777).toBe(0o600)
    await writeFile(layout.memory, '# Remember\nExisting content\n')
    await writeFile(join(layout.workspaces, 'notes.txt'), 'workspace')
    await writeFile(join(layout.skills, 'skill.txt'), 'skill')
    await Promise.all(Array.from({ length: 8 }, () => createThreadStorage({ dataRoot }).initialize(botId)))
    expect(await readFile(layout.memory, 'utf8')).toBe('# Remember\nExisting content\n')
    expect(await readFile(join(layout.workspaces, 'notes.txt'), 'utf8')).toBe('workspace')
    expect(await readFile(join(layout.skills, 'skill.txt'), 'utf8')).toBe('skill')
    expect((await readdir(layout.root)).sort()).toEqual(['MEMORY.md', 'skills', 'workspaces'])
  })

  test('reads GC_DATA_ROOT without eagerly touching the default data directory', async () => {
    const previous = process.env.GC_DATA_ROOT
    try {
      process.env.GC_DATA_ROOT = dataRoot
      const storage = createThreadStorage()
      expect((await storage.initialize(botId)).root).toBe(join(dataRoot, botId))
      expect(DEFAULT_MAX_MEMORY_BYTES).toBe(1024 * 1024)
      expect(() => createThreadStorage({ dataRoot: '' })).toThrow(StorageError)
      expect(() => createThreadStorage({ dataRoot, maxMemoryBytes: 0 })).toThrow(StorageError)
      expect(() => createThreadStorage({ dataRoot, lockTimeoutMs: 0 })).toThrow(StorageError)
    } finally {
      if (previous === undefined) delete process.env.GC_DATA_ROOT
      else process.env.GC_DATA_ROOT = previous
    }
  })

  test('rejects invalid IDs and traversal before creating directories', async () => {
    const storage = createThreadStorage({ dataRoot })
    for (const id of ['', '../escape', `${botId}/../${otherBotId}`, `/${botId}`, `${botId}\\file`, `${botId}\0`, 'not-a-uuid', `${botId}x`]) {
      await rejectsCode(() => storage.initialize(id), 'INVALID_UUID')
      await rejectsCode(() => storage.readMemory(id), 'INVALID_UUID')
      await rejectsCode(() => storage.appendMemory(id, 'x'), 'INVALID_UUID')
      await rejectsCode(() => storage.updateMemory(id, 'x', 'revision'), 'INVALID_UUID')
    }
    expect(await readdir(temporary)).toEqual([])
    expect(validateStorageUUID(botId.toUpperCase())).toBe(botId)
  })
})

describe('memory revisions and writes', () => {
  test('uses content SHA-256 revisions, exact append, and compare-and-swap replacement', async () => {
    const storage = createThreadStorage({ dataRoot })
    const empty = await storage.readMemory(botId)
    expect(empty).toEqual({ content: '', bytes: 0, revision: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
    const first = await storage.appendMemory(botId, '\ufefffirst\n', empty.revision)
    expect(first.revision).not.toBe(empty.revision)
    expect(await storage.appendMemory(botId, '')).toEqual(first)
    const second = await storage.appendMemory(botId, 'second')
    expect(second.content).toBe('\ufefffirst\nsecond')
    await rejectsCode(() => storage.updateMemory(botId, 'lost update', first.revision), 'REVISION_CONFLICT')
    await rejectsCode(() => storage.appendMemory(botId, 'stale', first.revision), 'REVISION_CONFLICT')
    await rejectsCode(() => storage.updateMemory(botId, 'unchecked', undefined as unknown as string), 'REVISION_CONFLICT')
    expect(await storage.readMemory(botId)).toEqual(second)
    const replacement = await storage.updateMemory(botId, 'replacement', second.revision)
    expect(replacement.content).toBe('replacement')
    expect(await createThreadStorage({ dataRoot }).readMemory(botId)).toEqual(replacement)
    expect(await storage.updateMemory(botId, '', replacement.revision)).toEqual(empty)
  })

  test('serializes concurrent appends across independent instances without losing entries', async () => {
    const lines = Array.from({ length: 30 }, (_, index) => `entry-${index}\n`)
    await Promise.all(lines.map((line) => createThreadStorage({ dataRoot }).appendMemory(botId, line)))
    const result = await createThreadStorage({ dataRoot }).readMemory(botId)
    expect(result.content.trimEnd().split('\n').sort()).toEqual(lines.map((line) => line.trimEnd()).sort())
    expect(result.bytes).toBe(Buffer.byteLength(lines.join('')))
  })

  test('only one concurrent replacement accepts the same revision', async () => {
    const storage = createThreadStorage({ dataRoot })
    const { revision } = await storage.readMemory(botId)
    const results = await Promise.allSettled(['one', 'two'].map((content) => storage.updateMemory(botId, content, revision)))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason.code).toBe('REVISION_CONFLICT')
  })

  test('serializes append writers in separate processes', async () => {
    const modulePath = fileURLToPath(new URL('./storage.ts', import.meta.url))
    await Promise.all(Array.from({ length: 3 }, (_, index) => new Promise<void>((resolve, reject) => {
      const script = `import { createThreadStorage } from ${JSON.stringify(modulePath)}; const storage = createThreadStorage({ dataRoot: ${JSON.stringify(dataRoot)} }); for (let i = 0; i < 8; i++) await storage.appendMemory(${JSON.stringify(botId)}, ${JSON.stringify(`process-${index}-`)} + i + '\\n');`
      const child = spawn(process.execPath, ['--eval', script], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Writer exited ${code}: ${stderr}`)))
    })))
    const { content } = await createThreadStorage({ dataRoot }).readMemory(botId)
    const expected = Array.from({ length: 3 }, (_, process) => Array.from({ length: 8 }, (_, index) => `process-${process}-${index}`)).flat()
    expect(content.trimEnd().split('\n').sort()).toEqual(expected.sort())
  })

  test('enforces UTF-8 byte limits on read, append and replacement without truncating content', async () => {
    const storage = createThreadStorage({ dataRoot, maxMemoryBytes: 4 })
    const current = await storage.appendMemory(botId, 'éé')
    expect(current.bytes).toBe(4)
    await rejectsCode(() => storage.appendMemory(botId, 'x'), 'MEMORY_TOO_LARGE')
    await rejectsCode(() => storage.updateMemory(botId, '12345', current.revision), 'MEMORY_TOO_LARGE')
    expect(await storage.readMemory(botId)).toEqual(current)
    const path = join(dataRoot, botId, 'MEMORY.md')
    await writeFile(path, '12345')
    await rejectsCode(() => storage.readMemory(botId), 'MEMORY_TOO_LARGE')
    await rejectsCode(() => storage.initialize(botId), 'MEMORY_TOO_LARGE')
    await rejectsCode(() => storage.appendMemory(botId, ''), 'MEMORY_TOO_LARGE')
    await rejectsCode(() => storage.updateMemory(botId, '', current.revision), 'MEMORY_TOO_LARGE')
    expect(await readFile(path, 'utf8')).toBe('12345')
    await writeFile(path, Buffer.from([0xff]))
    await rejectsCode(() => storage.readMemory(botId), 'INVALID_MEMORY')
    await writeFile(path, '')
    expect((await storage.appendMemory(botId, 'safe')).content).toBe('safe')
  })

  test('times out on abandoned locks without stealing or deleting them', async () => {
    const storage = createThreadStorage({ dataRoot, lockTimeoutMs: 30 })
    const layout = await storage.initialize(botId)
    const lock = join(layout.root, '.memory.lock')
    await mkdir(lock)
    await writeFile(join(lock, 'MEMORY.md.next'), 'unfinished')
    await rejectsCode(() => storage.appendMemory(botId, 'blocked'), 'LOCK_TIMEOUT')
    expect(await readFile(join(lock, 'MEMORY.md.next'), 'utf8')).toBe('unfinished')
    expect(await readFile(layout.memory, 'utf8')).toBe('')
  })
})

describe('filesystem boundaries', () => {
  test('rejects a symlinked data root', async () => {
    const outside = join(temporary, 'outside')
    await mkdir(outside)
    await symlink(outside, dataRoot)
    await rejectsCode(() => createThreadStorage({ dataRoot }).initialize(botId), 'UNSAFE_PATH')
    expect(await readdir(outside)).toEqual([])
  })

  test('rejects symlinks at every managed directory and memory/lock boundary', async () => {
    const outside = join(temporary, 'outside')
    await mkdir(outside)
    const privateFile = join(outside, 'private.md')
    await writeFile(privateFile, 'private')
    for (const name of ['', 'workspaces', 'skills', 'MEMORY.md', '.memory.lock']) {
      const storage = createThreadStorage({ dataRoot })
      const layout = await storage.initialize(botId)
      const target = name ? join(layout.root, name) : layout.root
      await rm(target, { recursive: true, force: true })
      await symlink(name === 'MEMORY.md' ? privateFile : outside, target)
      await rejectsCode(() => storage.initialize(botId), 'UNSAFE_PATH')
      await rejectsCode(() => storage.readMemory(botId), 'UNSAFE_PATH')
      await rejectsCode(() => storage.appendMemory(botId, 'tampered'), 'UNSAFE_PATH')
      await rejectsCode(() => storage.updateMemory(botId, 'tampered', 'stale'), 'UNSAFE_PATH')
      expect(await readFile(privateFile, 'utf8')).toBe('private')
      expect(await readdir(outside)).toEqual(['private.md'])
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  test('rejects dangling symlinks, hard-linked memory and non-file memory', async () => {
    const storage = createThreadStorage({ dataRoot })
    const layout = await storage.initialize(botId)
    const outside = join(temporary, 'missing.md')
    await rm(layout.memory)
    await symlink(outside, layout.memory)
    await rejectsCode(() => storage.readMemory(botId), 'UNSAFE_PATH')
    await rm(layout.memory)
    await writeFile(outside, 'private')
    await link(outside, layout.memory)
    await rejectsCode(() => storage.appendMemory(botId, 'tampered'), 'UNSAFE_PATH')
    expect(await readFile(outside, 'utf8')).toBe('private')
    await rm(layout.memory)
    await mkdir(layout.memory)
    await rejectsCode(() => storage.readMemory(botId), 'UNSAFE_PATH')
  })
})

describe('storage authorization', () => {
  function connectionFor(owner: string, member: boolean, groupOwner = userId) {
    return drizzle(async (sql, params) => {
      if (sql.includes('from "bots"')) {
        expect(sql).toContain('"bots"."id" = $1')
        expect(sql).toContain('"bots"."user_id" = $2')
        return { rows: params[0] === botId && params[1] === owner ? [[botId]] : [] }
      }
      expect(sql).toContain('inner join "chat_members" on "chat_members"."chat_id" = "group_chats"."id"')
      expect(sql).toContain('"group_chats"."id" = $1')
      expect(sql).toContain('"group_chats"."user_id" = $2')
      expect(sql).toContain('"chat_members"."bot_id" = $3')
      return { rows: params[0] === groupId && params[1] === groupOwner && params[2] === botId && member ? [[groupId]] : [] }
    })
  }

  test('direct scope is exactly the owned bot UUID; groups add only the current authorized group', async () => {
    const connection = connectionFor(userId, true)
    expect(await authorizeStorageScope(connection, { userId, botId, threadId: botId })).toEqual({ botId, threadId: botId, directoryIds: [botId] })
    const scope = await authorizeStorageScope(connection, { userId, botId, threadId: groupId })
    expect(scope).toEqual({ botId, threadId: groupId, directoryIds: [botId, groupId] })
    expect(Object.isFrozen(scope.directoryIds)).toBe(true)
    expect(await readdir(temporary)).toEqual([])
  })

  test('denies foreign bots, other private bot directories, missing membership and foreign groups', async () => {
    await rejectsCode(() => authorizeStorageScope(connectionFor(foreignUserId, true), { userId, botId, threadId: botId }), 'FORBIDDEN')
    await rejectsCode(() => authorizeStorageScope(connectionFor(userId, true), { userId, botId, threadId: otherBotId }), 'FORBIDDEN')
    await rejectsCode(() => authorizeStorageScope(connectionFor(userId, false), { userId, botId, threadId: groupId }), 'FORBIDDEN')
    await rejectsCode(() => authorizeStorageScope(connectionFor(userId, true, foreignUserId), { userId, botId, threadId: groupId }), 'FORBIDDEN')
    await rejectsCode(() => authorizeStorageScope(connectionFor(userId, true), { userId, botId, threadId: '../escape' }), 'INVALID_UUID')
    expect(await readdir(temporary)).toEqual([])
  })
})
