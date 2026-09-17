import { describe, expect, test } from 'bun:test'
import type { ChatMiddlewareContext, MetadataStore, ModelMessage } from '@tanstack/ai'
import { compactManually, compactionMiddleware, compactionSettings, tokenCount } from './compaction'

const history: ModelMessage[] = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `${index}: ${'context '.repeat(100)}` }))

describe('compaction', () => {
  test('settings accept only positive integer budgets and supported strategies', () => {
    expect(compactionSettings({})).toEqual({ maxTokens: 24000, type: 'summarize-oldest' })
    for (const value of ['', '0', '-1', '1.5', '100x', 'Infinity']) {
      expect(compactionSettings({ GC_COMPACTION_MAX_TOKENS: value }).maxTokens).toBe(24000)
    }
    expect(compactionSettings({ GC_COMPACTION_MAX_TOKENS: '4000', GC_COMPACTION_TYPE: 'off' })).toEqual({ maxTokens: 4000, type: 'off' })
    expect(compactionSettings({ GC_COMPACTION_TYPE: 'invalid' }).type).toBe('summarize-oldest')
  })

  test('manual compaction works below automatic threshold and retains recent messages', async () => {
    const settings = compactionSettings({})
    expect(tokenCount(history)).toBeLessThan(settings.maxTokens)
    let summarized: ModelMessage[] = []
    const result = await compactManually(history, settings, async (messages) => {
      summarized = messages
      return 'User needs context; decisions and outstanding work preserved.'
    })
    expect(result).not.toBeNull()
    expect(tokenCount(result!)).toBeLessThan(tokenCount(history))
    expect(result!.slice(-2)).toEqual(history.slice(-2))
    expect(summarized.length).toBeGreaterThan(0)
    expect(result![0]!.content).toContain('untrusted-conversation-summary')
    expect(history).toHaveLength(12)
  })

  test('too little history or a summary that grows context is a no-op', async () => {
    expect(await compactManually(history.slice(0, 5), compactionSettings({}), async () => 'summary')).toBeNull()
    expect(await compactManually(history, compactionSettings({}), async () => 'x'.repeat(20000))).toBeNull()
  })

  test('off disables automation, not deliberate manual compaction', async () => {
    const settings = compactionSettings({ GC_COMPACTION_TYPE: 'off' })
    const store: MetadataStore = { get: async () => null, set: async () => {}, delete: async () => {} }
    expect(compactionMiddleware(settings, store, async () => 'summary')).toEqual([])
    expect(await compactManually(history, settings, async () => 'summary')).not.toBeNull()
  })

  test('public-history mode never summarizes or checkpoints speaker tool loops', async () => {
    const values: unknown[] = []
    const previews: unknown[] = []
    const summaries: ModelMessage[][] = []
    const store: MetadataStore = {
      get: async () => null,
      set: async (_namespace, _key, value) => { values.push(value) },
      delete: async () => {},
    }
    const middleware = compactionMiddleware({ maxTokens: 100, type: 'summarize-oldest' }, store, async (messages) => {
      summaries.push(messages)
      return 'Public summary'
    }, true)
    const ctx = {
      phase: 'beforeModel', threadId: 'thread', capabilities: { markProvided() {} },
      emitCustomEvent: (_name: string, value: unknown) => { previews.push(value) },
    } as unknown as ChatMiddlewareContext
    await middleware[0]!.setup!(ctx)
    await middleware[1]!.onConfig!({ ...ctx, phase: 'init' }, { messages: history, systemPrompts: ['PRIVATE MEMORY'], tools: [] })
    expect(values).toEqual([])
    await middleware[1]!.onConfig!(ctx, { messages: history, systemPrompts: ['PRIVATE MEMORY'], tools: [] })
    const before = JSON.stringify({ values, previews, summaries })
    expect(values).toHaveLength(1)
    expect(before).not.toContain('PRIVATE MEMORY')
    const result = await middleware[1]!.onConfig!(ctx, {
      messages: [...history, { role: 'tool', toolCallId: 'read', content: 'PRIVATE RESULT'.repeat(1000) }],
      systemPrompts: ['PRIVATE MEMORY'], tools: [],
    })
    expect(result?.providerMessages?.at(-1)?.content).toContain('PRIVATE RESULT')
    expect(result?.providerMessages?.length).toBeLessThan(history.length + 1)
    expect(JSON.stringify({ values, previews, summaries })).toBe(before)
  })

  test('official middleware saves and reuses checkpoints without another summary', async () => {
    const values = new Map<string, unknown>()
    const store: MetadataStore = {
      get: async (namespace, key) => values.get(JSON.stringify([namespace, key])) ?? null,
      set: async (namespace, key, value) => { values.set(JSON.stringify([namespace, key]), value) },
      delete: async (namespace, key) => { values.delete(JSON.stringify([namespace, key])) },
    }
    let calls = 0
    const run = async (messages: ModelMessage[]) => {
      const middleware = compactionMiddleware({ maxTokens: 2000, type: 'summarize-oldest' }, store, async () => {
        calls++
        return 'Concise summary'
      })
      const ctx = {
        phase: 'beforeModel', threadId: 'thread', capabilities: { markProvided() {} }, emitCustomEvent() {},
      } as unknown as ChatMiddlewareContext
      await middleware[0]!.setup!(ctx)
      return middleware[1]!.onConfig!(ctx, { messages, systemPrompts: [], tools: [] })
    }
    const first = await run(history)
    expect(first?.providerMessages?.length).toBeLessThan(history.length)
    expect(values.size).toBe(1)
    const next: ModelMessage = { role: 'user', content: 'Continue' }
    const second = await run([...history, next])
    expect(second?.providerMessages).toEqual([...first!.providerMessages!, next])
    expect(calls).toBe(1)
  })
})
