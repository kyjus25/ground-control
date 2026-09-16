export const BOT_COLORS = [
  'green',
  'teal',
  'sky',
  'blue',
  'violet',
  'fuchsia',
  'rose',
  'red',
  'orange',
  'amber',
  'lime',
  'stone',
] as const
export type BotColor = (typeof BOT_COLORS)[number]

export const BOT_SHAPES = ['circle', 'square', 'hex', 'triangle', 'diamond'] as const
export type BotShape = (typeof BOT_SHAPES)[number]

// Row shape returned by listBots.
export type Bot = {
  id: string
  name: string
  emoji: string
  color: BotColor
  shape: BotShape
  category: string | null
  modelId: string | null
  // JSON array of enabled skill names.
  skills: string
}
