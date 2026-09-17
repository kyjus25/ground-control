import { createServerFn } from '@tanstack/solid-start'
import { SaveThreadSkillSchema, ThreadSkillSchema, ThreadStorageSchema, UpdateThreadMemorySchema } from '../../../../types/storage-schemas'

export const getThreadMemory = createServerFn({ method: 'POST' })
  .validator(ThreadStorageSchema)
  .handler(async ({ data }) => {
    const api = await import('../../../../server/memory')
    return api.getThreadMemory({ data })
  })

export const updateThreadMemory = createServerFn({ method: 'POST' })
  .validator(UpdateThreadMemorySchema)
  .handler(async ({ data }) => {
    const api = await import('../../../../server/memory')
    return api.updateThreadMemory({ data })
  })

export const listThreadSkills = createServerFn({ method: 'POST' })
  .validator(ThreadStorageSchema)
  .handler(async ({ data }) => {
    const api = await import('../../../../server/skills')
    return api.listThreadSkills({ data })
  })

export const saveThreadSkill = createServerFn({ method: 'POST' })
  .validator(SaveThreadSkillSchema)
  .handler(async ({ data }) => {
    const api = await import('../../../../server/skills')
    return api.saveThreadSkill({ data })
  })

export const deleteThreadSkill = createServerFn({ method: 'POST' })
  .validator(ThreadSkillSchema)
  .handler(async ({ data }) => {
    const api = await import('../../../../server/skills')
    return api.deleteThreadSkill({ data })
  })
