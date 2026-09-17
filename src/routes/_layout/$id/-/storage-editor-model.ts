import * as v from 'valibot'
import { MAX_MEMORY_BYTES, MAX_SKILL_BYTES, MAX_THREAD_SKILLS, SkillNameSchema } from '../../../../types/storage-schemas'

export function contentBytes(content: string) {
  return new TextEncoder().encode(content).length
}

export function memoryDraftError(content: string) {
  return contentBytes(content) > MAX_MEMORY_BYTES ? 'Memory must be 1 MiB or smaller.' : null
}

export function skillDraftError(name: string, content: string, existingNames: readonly string[], creating: boolean) {
  const parsed = v.safeParse(SkillNameSchema, name)
  if (!parsed.success) return parsed.issues[0].message
  if (contentBytes(content) > MAX_SKILL_BYTES) return 'Skill files must be 16 KiB or smaller.'
  if (creating && existingNames.includes(name)) return 'A skill with this filename already exists. Open it to edit instead.'
  if (creating && existingNames.length >= MAX_THREAD_SKILLS) return `This thread already has ${MAX_THREAD_SKILLS} skills. Delete one before creating another.`
  return null
}
