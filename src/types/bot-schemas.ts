import * as v from 'valibot'
import { BOT_COLORS, BOT_SHAPES } from './bot'

// The bot editor contract — used by the client for field validation and by
// the createBot/updateBot server functions as their `.validator()`.
export const BotInputSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Name is required')),
  emoji: v.pipe(v.string(), v.minLength(1, 'Pick an emoji')),
  color: v.picklist(BOT_COLORS),
  shape: v.picklist(BOT_SHAPES),
  category: v.optional(v.string()),
  soul: v.optional(v.string()),
  instructions: v.optional(v.string()),
  modelId: v.optional(v.string()),
})

export const BotInputWithIdSchema = v.object({
  ...BotInputSchema.entries,
  id: v.pipe(v.string(), v.uuid()),
})
