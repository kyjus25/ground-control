import { Buffer, constants as bufferConstants } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { and, eq } from 'drizzle-orm'
import { bots, chatMembers, groupChats } from './db/schema'
import type { ThreadTransaction } from './thread-guard'

export const DEFAULT_MAX_MEMORY_BYTES = 1024 * 1024

export type StorageErrorCode = 'INVALID_UUID' | 'INVALID_CONFIG' | 'UNSAFE_PATH' | 'MEMORY_TOO_LARGE' | 'INVALID_MEMORY' | 'REVISION_CONFLICT' | 'LOCK_TIMEOUT' | 'FORBIDDEN'

export class StorageError extends Error {
  constructor(public code: StorageErrorCode, message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

export type StorageOptions = {
  dataRoot?: string
  maxMemoryBytes?: number
  lockTimeoutMs?: number
}

export type StorageLayout = Readonly<{
  threadId: string
  root: string
  workspaces: string
  skills: string
  memory: string
}>

export type MemorySnapshot = Readonly<{
  content: string
  revision: string
  bytes: number
}>

export type ThreadStorage = {
  initialize(threadId: string): Promise<StorageLayout>
  withSkills<T>(threadId: string, operation: (layout: StorageLayout) => Promise<T>): Promise<T>
  readMemory(threadId: string): Promise<MemorySnapshot>
  appendMemory(threadId: string, content: string, expectedRevision?: string): Promise<MemorySnapshot>
  updateMemory(threadId: string, content: string, expectedRevision: string): Promise<MemorySnapshot>
}

export type StorageScopeInput = {
  userId: string
  botId: string
  threadId: string
}

export type StorageScope = Readonly<{
  botId: string
  threadId: string
  directoryIds: readonly string[]
}>

export type StorageConnection = Pick<ThreadTransaction, 'select'>

export function validateStorageUUID(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new StorageError('INVALID_UUID', 'Storage IDs must be UUIDs')
  }
  return value.toLowerCase()
}

export async function authorizeThreadStorage(connection: StorageConnection, user: string, thread: string): Promise<string> {
  const userId = validateStorageUUID(user)
  const threadId = validateStorageUUID(thread)
  const [bot] = await connection.select({ id: bots.id }).from(bots)
    .where(and(eq(bots.id, threadId), eq(bots.userId, userId))).limit(1)
  if (bot) return threadId
  const [group] = await connection.select({ id: groupChats.id }).from(groupChats)
    .where(and(eq(groupChats.id, threadId), eq(groupChats.userId, userId))).limit(1)
  if (!group) throw new StorageError('FORBIDDEN', 'Storage access denied')
  return threadId
}

export async function authorizeStorageScope(connection: StorageConnection, input: StorageScopeInput): Promise<StorageScope> {
  const userId = validateStorageUUID(input.userId)
  const botId = validateStorageUUID(input.botId)
  const threadId = validateStorageUUID(input.threadId)
  const [bot] = await connection.select({ id: bots.id }).from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId))).limit(1)
  if (!bot) throw new StorageError('FORBIDDEN', 'Storage access denied')
  if (threadId !== botId) {
    const [group] = await connection.select({ id: groupChats.id }).from(groupChats)
      .innerJoin(chatMembers, eq(chatMembers.chatId, groupChats.id))
      .where(and(eq(groupChats.id, threadId), eq(groupChats.userId, userId), eq(chatMembers.botId, botId))).limit(1)
    if (!group) throw new StorageError('FORBIDDEN', 'Storage access denied')
  }
  return Object.freeze({ botId, threadId, directoryIds: Object.freeze(threadId === botId ? [botId] : [botId, threadId]) })
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function containedPath(root: string, name: string): string {
  const path = resolve(root, name)
  const child = relative(root, path)
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new StorageError('UNSAFE_PATH', 'Path escapes storage directory')
  }
  return path
}

async function assertDirectory(path: string): Promise<void> {
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) {
    throw new StorageError('UNSAFE_PATH', 'Storage directories must not be symlinks')
  }
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 })
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error
  }
  await assertDirectory(path)
}

async function assertMemoryFile(path: string) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new StorageError('UNSAFE_PATH', 'Memory must be a regular, unlinked file')
  }
  return stat
}

function snapshot(bytes: Buffer): MemorySnapshot {
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new StorageError('INVALID_MEMORY', 'Memory must contain valid UTF-8')
  }
  return Object.freeze({ content, revision: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
}

export function createThreadStorage(options: StorageOptions = {}): ThreadStorage {
  const configuredRoot = options.dataRoot ?? process.env.GC_DATA_ROOT ?? './data'
  const maxMemoryBytes = options.maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES
  const lockTimeoutMs = options.lockTimeoutMs ?? 5000
  if (typeof configuredRoot !== 'string' || !configuredRoot.trim() || configuredRoot.includes('\0')
    || !Number.isSafeInteger(maxMemoryBytes) || maxMemoryBytes < 1 || maxMemoryBytes >= bufferConstants.MAX_LENGTH
    || !Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1) {
    throw new StorageError('INVALID_CONFIG', 'Invalid storage configuration')
  }
  const requestedRoot = resolve(configuredRoot)
  if (dirname(requestedRoot) === requestedRoot) throw new StorageError('INVALID_CONFIG', 'Data root cannot be a filesystem root')
  let canonicalRoot: string | undefined

  async function layoutFor(value: string): Promise<StorageLayout> {
    const threadId = validateStorageUUID(value)
    await mkdir(dirname(requestedRoot), { recursive: true, mode: 0o700 })
    const root = join(await realpath(dirname(requestedRoot)), basename(requestedRoot))
    if (canonicalRoot !== undefined && canonicalRoot !== root) throw new StorageError('UNSAFE_PATH', 'Data root changed')
    canonicalRoot = root
    await ensureDirectory(root)
    const threadRoot = containedPath(root, threadId)
    await ensureDirectory(threadRoot)
    const workspaces = containedPath(threadRoot, 'workspaces')
    const skills = containedPath(threadRoot, 'skills')
    await ensureDirectory(workspaces)
    await ensureDirectory(skills)
    return Object.freeze({ threadId, root: threadRoot, workspaces, skills, memory: containedPath(threadRoot, 'MEMORY.md') })
  }

  async function assertLayout(layout: StorageLayout): Promise<void> {
    await assertDirectory(canonicalRoot!)
    await assertDirectory(layout.root)
    await assertDirectory(layout.workspaces)
    await assertDirectory(layout.skills)
  }

  async function withLock<T>(threadId: string, operation: (layout: StorageLayout, lock: string) => Promise<T>): Promise<T> {
    const layout = await layoutFor(threadId)
    const lock = containedPath(layout.root, '.memory.lock')
    const deadline = Date.now() + lockTimeoutMs
    for (;;) {
      await assertLayout(layout)
      try {
        await mkdir(lock, { mode: 0o700 })
        break
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        try {
          await assertDirectory(lock)
        } catch (checkError) {
          if (!hasCode(checkError, 'ENOENT')) throw checkError
        }
        if (Date.now() >= deadline) throw new StorageError('LOCK_TIMEOUT', 'Memory is locked; retry or recover an abandoned lock offline')
        await delay(10)
      }
    }
    try {
      await assertLayout(layout)
      await assertDirectory(lock)
      try {
        const file = await open(layout.memory, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        await file.close()
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
      }
      return await operation(layout, lock)
    } finally {
      await rmdir(lock)
    }
  }

  async function read(layout: StorageLayout): Promise<MemorySnapshot> {
    await assertLayout(layout)
    const before = await assertMemoryFile(layout.memory)
    if (before.size > maxMemoryBytes) throw new StorageError('MEMORY_TOO_LARGE', 'Memory exceeds the byte limit')
    const file = await open(layout.memory, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino) {
        throw new StorageError('UNSAFE_PATH', 'Memory file changed during access')
      }
      if (stat.size > maxMemoryBytes) throw new StorageError('MEMORY_TOO_LARGE', 'Memory exceeds the byte limit')
      const bytes = Buffer.alloc(maxMemoryBytes + 1)
      let length = 0
      while (length < bytes.length) {
        const result = await file.read(bytes, length, bytes.length - length, length)
        if (!result.bytesRead) break
        length += result.bytesRead
      }
      if (length > maxMemoryBytes) throw new StorageError('MEMORY_TOO_LARGE', 'Memory exceeds the byte limit')
      return snapshot(bytes.subarray(0, length))
    } finally {
      await file.close()
    }
  }

  function validateContent(content: string): void {
    if (typeof content !== 'string') throw new StorageError('INVALID_MEMORY', 'Memory content must be a string')
    if (Buffer.byteLength(content, 'utf8') > maxMemoryBytes) throw new StorageError('MEMORY_TOO_LARGE', 'Memory exceeds the byte limit')
  }

  async function write(layout: StorageLayout, lock: string, content: string): Promise<MemorySnapshot> {
    validateContent(content)
    const bytes = Buffer.from(content, 'utf8')
    const next = snapshot(bytes)
    const temporary = containedPath(lock, 'MEMORY.md.next')
    await assertLayout(layout)
    await assertDirectory(lock)
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    let replaced = false
    try {
      try {
        await file.writeFile(bytes)
        await file.sync()
      } finally {
        await file.close()
      }
      await assertLayout(layout)
      await assertMemoryFile(layout.memory)
      await rename(temporary, layout.memory)
      replaced = true
      return next
    } finally {
      if (!replaced) await unlink(temporary)
    }
  }

  function checkRevision(current: MemorySnapshot, expected: string): void {
    if (typeof expected !== 'string' || expected !== current.revision) {
      throw new StorageError('REVISION_CONFLICT', 'Memory revision has changed; read it again before updating')
    }
  }

  return {
    initialize: (threadId) => withLock(threadId, async (layout) => {
      await read(layout)
      return layout
    }),
    withSkills: (threadId, operation) => withLock(threadId, async (layout) => {
      await assertLayout(layout)
      return operation(layout)
    }),
    readMemory: (threadId) => withLock(threadId, read),
    appendMemory: async (threadId, content, expectedRevision) => {
      validateStorageUUID(threadId)
      validateContent(content)
      return withLock(threadId, async (layout, lock) => {
        const current = await read(layout)
        if (expectedRevision !== undefined) checkRevision(current, expectedRevision)
        return write(layout, lock, current.content + content)
      })
    },
    updateMemory: async (threadId, content, expectedRevision) => {
      validateStorageUUID(threadId)
      validateContent(content)
      return withLock(threadId, async (layout, lock) => {
        const current = await read(layout)
        checkRevision(current, expectedRevision)
        return write(layout, lock, content)
      })
    },
  }
}
