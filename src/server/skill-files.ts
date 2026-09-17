import { constants } from 'node:fs'
import { lstat, open, readdir, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as v from 'valibot'
import { MAX_SKILL_BYTES, MAX_THREAD_SKILLS, SkillNameSchema } from '../types/storage-schemas'
import { createThreadStorage, StorageError, type StorageLayout, type ThreadStorage } from './storage'

export type SkillFile = { name: string; content: string }

export function createSkillFiles(storage: ThreadStorage = createThreadStorage()) {
  async function pathFor(layout: StorageLayout, name: string) {
    v.parse(SkillNameSchema, name)
    for (const directory of [dirname(layout.root), layout.root, layout.skills]) {
      const stat = await lstat(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) {
        throw new StorageError('UNSAFE_PATH', 'Unsafe skill directory')
      }
    }
    return join(layout.skills, name)
  }

  async function regular(path: string) {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new StorageError('UNSAFE_PATH', 'Skill must be a regular, unlinked file')
    }
    return stat
  }

  async function read(layout: StorageLayout, name: string): Promise<SkillFile> {
    const path = await pathFor(layout, name)
    const before = await regular(path)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== before.ino || stat.dev !== before.dev) {
        throw new StorageError('UNSAFE_PATH', 'Skill changed during access')
      }
      if (stat.size > MAX_SKILL_BYTES) throw new Error('Skill exceeds byte limit')
      const bytes = Buffer.alloc(MAX_SKILL_BYTES + 1)
      let length = 0
      while (length < bytes.length) {
        const result = await file.read(bytes, length, bytes.length - length, length)
        if (!result.bytesRead) break
        length += result.bytesRead
      }
      if (length > MAX_SKILL_BYTES) throw new Error('Skill exceeds byte limit')
      return { name, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)) }
    } finally {
      await file.close()
    }
  }

  async function names(layout: StorageLayout) {
    await pathFor(layout, 'check.md')
    const entries = (await readdir(layout.skills)).filter((name) => name.endsWith('.md')).sort()
    if (entries.length > MAX_THREAD_SKILLS) throw new Error('Too many skill files')
    for (const name of entries) v.parse(SkillNameSchema, name)
    return entries
  }

  return {
    list: (threadId: string): Promise<SkillFile[]> => storage.withSkills(threadId, async (layout) => {
      const result: SkillFile[] = []
      for (const name of await names(layout)) result.push(await read(layout, name))
      return result
    }),
    get: async (threadId: string, name: string): Promise<SkillFile> => {
      v.parse(SkillNameSchema, name)
      return storage.withSkills(threadId, (layout) => read(layout, name))
    },
    save: async (threadId: string, name: string, content: string): Promise<SkillFile> => {
      v.parse(SkillNameSchema, name)
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES) throw new Error('Skill exceeds byte limit')
      return storage.withSkills(threadId, async (layout) => {
        const entries = await names(layout)
        const path = await pathFor(layout, name)
        try { await regular(path) } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
          if (entries.length >= MAX_THREAD_SKILLS) throw new Error('Too many skill files')
        }
        const temporary = join(layout.skills, `.skill-${crypto.randomUUID()}.tmp`)
        const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        let replaced = false
        try {
          try {
            await file.writeFile(content, 'utf8')
            await file.sync()
          } finally { await file.close() }
          await pathFor(layout, name)
          try { await regular(path) } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
          }
          await rename(temporary, path)
          replaced = true
          return { name, content }
        } finally {
          if (!replaced) await unlink(temporary)
        }
      })
    },
    delete: async (threadId: string, name: string): Promise<void> => {
      v.parse(SkillNameSchema, name)
      return storage.withSkills(threadId, async (layout) => {
        const path = await pathFor(layout, name)
        await regular(path)
        await unlink(path)
      })
    },
  }
}
