import type { InferInput } from 'valibot'
import { SaveThreadSkillSchema, ThreadSkillSchema, ThreadStorageSchema } from '../types/storage-schemas'
import { requireThreadStorage } from './memory'
import { createSkillFiles } from './skill-files'

export async function listThreadSkills({ data }: { data: InferInput<typeof ThreadStorageSchema> }) {
  return createSkillFiles().list(await requireThreadStorage(data.threadId))
}

export async function saveThreadSkill({ data }: { data: InferInput<typeof SaveThreadSkillSchema> }) {
  return createSkillFiles().save(await requireThreadStorage(data.threadId), data.name, data.content)
}

export async function deleteThreadSkill({ data }: { data: InferInput<typeof ThreadSkillSchema> }) {
  await createSkillFiles().delete(await requireThreadStorage(data.threadId), data.name)
  return { deleted: true }
}
