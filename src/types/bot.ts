// Placeholder shape until bots are backed by the database (M2).
export type Bot = {
  id: string
  name: string
  detail: string
  emoji: string
  avatarClass: string
  dotClass: string
  dimmed?: boolean
}

export type BotGroup = { category: string; bots: Bot[] }
