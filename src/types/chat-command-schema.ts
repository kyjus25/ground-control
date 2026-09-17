import * as v from 'valibot'

export const chatCommandSchema = v.object({
  threadId: v.pipe(v.string(), v.uuid()),
  command: v.picklist(['clear', 'compact']),
})
