import { describe, expect, test } from 'bun:test'
import { contentBytes, memoryDraftError, skillDraftError } from './storage-editor-model'
import { MAX_MEMORY_BYTES, MAX_SKILL_BYTES, MAX_THREAD_SKILLS } from '../../../../types/storage-schemas'
import { SKILLS, hasSkillGrant, normalizeSkills } from '../../../../types/skill'

describe('thread file editor validation', () => {
  test('counts UTF-8 bytes and allows empty markdown', () => {
    expect(contentBytes('é')).toBe(2)
    expect(memoryDraftError('')).toBeNull()
    expect(skillDraftError('notes.md', '', [], true)).toBeNull()
    expect(memoryDraftError('a'.repeat(MAX_MEMORY_BYTES))).toBeNull()
    expect(memoryDraftError('é'.repeat(MAX_MEMORY_BYTES / 2 + 1))).not.toBeNull()
    expect(skillDraftError('notes.md', 'a'.repeat(MAX_SKILL_BYTES), [], true)).toBeNull()
    expect(skillDraftError('notes.md', 'é'.repeat(MAX_SKILL_BYTES / 2 + 1), [], true)).not.toBeNull()
  })

  test('validates filenames and avoids overwriting known files during creation', () => {
    for (const name of ['../notes.md', 'Notes.md', 'notes.txt', '.md', 'a/b.md', 'a'.repeat(65) + '.md']) {
      expect(skillDraftError(name, '', [], true)).not.toBeNull()
    }
    expect(skillDraftError('notes.md', '', ['notes.md'], true)).not.toBeNull()
    expect(skillDraftError('notes.md', '', ['notes.md'], false)).toBeNull()
    expect(skillDraftError('notes-1_test.md', '<script>alert(1)</script>', [], true)).toBeNull()
  })

  test('allows edits at the file cap but blocks new files', () => {
    const names = Array.from({ length: MAX_THREAD_SKILLS }, (_, index) => `${index}.md`)
    expect(skillDraftError('new.md', '', names, true)).not.toBeNull()
    expect(skillDraftError('0.md', '', names, false)).toBeNull()
  })
})

describe('bot skill registry metadata', () => {
  test('normalizes legacy labels and rejects unknown grants', () => {
    expect(normalizeSkills('["Memory write", " Web search ", "memory-write", "unknown"]')).toEqual(['memory-write', 'web-search'])
    expect(normalizeSkills('invalid json')).toEqual([])
    expect(hasSkillGrant([], 'memory-read')).toBe(true)
    expect(hasSkillGrant(['Memory write'], 'memory-write')).toBe(true)
    for (const skill of SKILLS.filter((entry) => !entry.available)) {
      expect(hasSkillGrant([skill.id], skill.id)).toBe(false)
    }
  })
})
