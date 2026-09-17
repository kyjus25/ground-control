export const SKILLS = [
  { id: 'memory-read', name: 'Memory read', description: 'Read your private memory and authorized current group memory. Always enabled.', available: true },
  { id: 'memory-write', name: 'Memory write', description: 'Append to your private memory or authorized current group memory.', available: true },
  { id: 'web-search', name: 'Web search', description: 'Search the web. Not implemented yet.', available: false },
  { id: 'browser', name: 'Browser', description: 'Control a shared browser. Not implemented yet.', available: false },
  { id: 'file-access', name: 'File access', description: 'Access workspace files. Not implemented yet.', available: false },
  { id: 'cron', name: 'Cron', description: 'Schedule jobs. Not implemented yet.', available: false },
] as const

export type SkillId = typeof SKILLS[number]['id']

export function normalizeSkills(value: unknown): SkillId[] {
  let labels = value
  if (typeof labels === 'string') {
    try { labels = JSON.parse(labels) } catch { return [] }
  }
  if (!Array.isArray(labels)) return []
  const result = new Set<SkillId>()
  for (const label of labels) {
    if (typeof label !== 'string') continue
    const normalized = label.trim().toLowerCase().replace(/\s+/g, '-')
    const skill = SKILLS.find((entry) => entry.id === normalized)
    if (skill) result.add(skill.id)
  }
  return [...result]
}

export function hasSkillGrant(value: unknown, id: SkillId): boolean {
  return SKILLS.some((skill) => skill.id === id && skill.available)
    && (id === 'memory-read' || normalizeSkills(value).includes(id))
}
