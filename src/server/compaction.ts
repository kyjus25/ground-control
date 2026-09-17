import { MetadataCapability, provideMetadata, type ChatMiddleware, type MetadataStore, type ModelMessage } from '@tanstack/ai'
import { estimateMessageTokens, evictOldest, summarizeOldest, withCompaction, type CompactionStrategy } from '@tanstack/ai-compaction'

export type CompactionSettings = { maxTokens: number; type: 'evict-oldest' | 'summarize-oldest' | 'off' }
export type Summarizer = (messages: ModelMessage[]) => Promise<string>

export function compactionSettings(env: Record<string, string | undefined> = process.env): CompactionSettings {
  const value = Number(env.GC_COMPACTION_MAX_TOKENS)
  const type = env.GC_COMPACTION_TYPE?.trim()
  return {
    maxTokens: Number.isSafeInteger(value) && value > 0 ? value : 24000,
    type: type === 'off' || type === 'evict-oldest' || type === 'summarize-oldest' ? type : 'summarize-oldest',
  }
}

export function tokenCount(messages: readonly ModelMessage[]) {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
}

export function compactionStrategy(settings: CompactionSettings, summarize: Summarizer, keepRecentTokens?: number): CompactionStrategy {
  return settings.type === 'evict-oldest'
    ? evictOldest({ keepRecentTokens })
    : summarizeOldest({ summarize, keepRecentTokens, summaryRole: 'user' })
}

export function compactionMiddleware(settings: CompactionSettings, store: MetadataStore, summarize: Summarizer, publicHistoryOnly = false): ChatMiddleware[] {
  if (settings.type === 'off') return []
  const compaction = withCompaction({ maxTokens: settings.maxTokens, strategy: compactionStrategy(settings, summarize) })
  let configured = false
  let publicCount = 0
  let compacted: ModelMessage[] | undefined
  const guarded: ChatMiddleware = {
    ...compaction,
    onConfig: async (ctx, config) => {
      if (ctx.phase === 'init') return
      if (configured) {
        return compacted ? { providerMessages: [...compacted, ...config.messages.slice(publicCount)] } : undefined
      }
      configured = true
      publicCount = config.messages.length
      const result = await compaction.onConfig?.(ctx, config)
      compacted = result?.providerMessages
      return result
    },
  }
  return [
    {
      name: 'compaction-metadata',
      provides: [MetadataCapability],
      setup(ctx) { provideMetadata(ctx, store) },
    },
    publicHistoryOnly ? guarded : compaction,
  ]
}

export async function compactManually(messages: ModelMessage[], settings: CompactionSettings, summarize: Summarizer) {
  if (messages.length < 6) return null
  const before = tokenCount(messages)
  const target = Math.max(1, Math.min(settings.maxTokens, Math.floor(before * 0.6)))
  const keepRecentTokens = Math.max(tokenCount(messages.slice(-2)), Math.floor(target / 2))
  const result = await compactionStrategy(settings, summarize, keepRecentTokens)(messages, {
    maxTokens: target,
    estimate: estimateMessageTokens,
  })
  if (!result || tokenCount(result) >= before) return null
  return result
}
