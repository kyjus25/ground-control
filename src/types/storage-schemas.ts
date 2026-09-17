import * as v from 'valibot'

export const MAX_SKILL_BYTES = 16 * 1024
export const MAX_THREAD_SKILLS = 32
export const MAX_MEMORY_BYTES = 1024 * 1024
export const SkillNameSchema = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9_-]{0,63}\.md$/, 'Use a lowercase .md filename without paths'))
export const ThreadStorageSchema = v.strictObject({ threadId: v.pipe(v.string(), v.uuid()) })
export const UpdateThreadMemorySchema = v.strictObject({
  ...ThreadStorageSchema.entries,
  content: v.pipe(v.string(), v.maxLength(MAX_MEMORY_BYTES)),
  expectedRevision: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
})
export const ThreadSkillSchema = v.strictObject({ ...ThreadStorageSchema.entries, name: SkillNameSchema })
export const SaveThreadSkillSchema = v.strictObject({
  ...ThreadSkillSchema.entries,
  content: v.pipe(v.string(), v.maxLength(MAX_SKILL_BYTES)),
})
export const MemoryReadSchema = v.strictObject({ scope: v.picklist(['self', 'thread']) })
export const MemoryAppendSchema = v.strictObject({
  ...MemoryReadSchema.entries,
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_MEMORY_BYTES)),
})
