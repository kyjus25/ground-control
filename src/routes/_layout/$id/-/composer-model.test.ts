import { describe, expect, test } from 'bun:test'
import { atomicRange, completedToken, composerText, parseSubmission, replaceParts, suggestionQuery, type ComposerPart } from './composer-model'
import type { ThreadMember } from './Thread'

const bots: ThreadMember[] = [
  { id: 'one', name: 'Ada', emoji: '🌿', color: 'green', shape: 'circle' },
  { id: 'two', name: 'Ada Lovelace', emoji: '🔷', color: 'blue', shape: 'square' },
]
const text = (value: string): ComposerPart[] => [{ kind: 'text', text: value }]
const mention: ComposerPart = { kind: 'mention', text: '@Ada', botId: 'one' }
const command: ComposerPart = { kind: 'command', text: '/clear', command: 'clear' }

describe('composer submission', () => {
  test('accepts only standalone exact commands, typed or tokenized', () => {
    expect(parseSubmission(text(' /clear \n'))).toEqual({ kind: 'command', command: 'clear' })
    expect(parseSubmission(text('/compact'))).toEqual({ kind: 'command', command: 'compact' })
    expect(parseSubmission([command, ...text(' ')])).toEqual({ kind: 'command', command: 'clear' })
    for (const value of ['/clear extra', '/clear /compact', 'hello /clear', '/compact\n/clear', '/clear @Ada']) {
      expect(parseSubmission(text(value)).kind).toBe('error')
    }
    expect(parseSubmission([command, ...text('extra')]).kind).toBe('error')
    expect(parseSubmission([mention, ...text(' '), command]).kind).toBe('error')
  })

  test('rejects unknown leading commands without swallowing normal prose', () => {
    expect(parseSubmission(text('/unknown')).kind).toBe('error')
    expect(parseSubmission(text('/CLEAR')).kind).toBe('error')
    expect(parseSubmission(text('See https://example.test/clear'))).toEqual({ kind: 'message', text: 'See https://example.test/clear' })
    expect(parseSubmission(text(' \n '))).toEqual({ kind: 'empty' })
    expect(parseSubmission([mention, ...text(' hello\nworld')])).toEqual({ kind: 'message', text: '@Ada hello\nworld' })
  })
})

describe('composer suggestions and completion', () => {
  test('finds caret-local queries, including multiword names', () => {
    expect(suggestionQuery(text('hi @Ada Lo later'), 10)).toEqual({ kind: 'mention', query: 'Ada Lo', start: 3, end: 10 })
    expect(suggestionQuery(text('/co'), 3)).toEqual({ kind: 'command', query: 'co', start: 0, end: 3 })
    expect(suggestionQuery(text('mail@Ada'), 8)).toBeNull()
    expect(suggestionQuery([mention], 4)).toBeNull()
    expect(suggestionQuery(text('@Ada\nhello'), 10)).toBeNull()
  })

  test('offers commands only at the beginning of the draft', () => {
    for (const value of [' /co', 'hello /co', '\n/co']) {
      expect(suggestionQuery(text(value), value.length)).toBeNull()
    }
    expect(suggestionQuery([mention, ...text(' /co')], 8)).toBeNull()
    expect(completedToken(text('hello /clear'), 12, bots)).toBeNull()
    expect(completedToken([mention, ...text(' /clear')], 11, bots)).toBeNull()
  })

  test('completes exact commands and longest exact bot names at boundaries', () => {
    expect(completedToken(text('/clear'), 6, bots)?.part).toEqual(command)
    expect(completedToken(text('@Ada Lovelace'), 13, bots)?.part).toEqual({ kind: 'mention', text: '@Ada Lovelace', botId: 'two' })
    expect(completedToken(text('@ada'), 4, bots)?.part).toEqual(mention)
    expect(completedToken(text('mail@Ada'), 8, bots)).toBeNull()
    expect(completedToken(text('/clearing'), 9, bots)).toBeNull()
  })
})

describe('atomic composer operations', () => {
  const parts = [...text('hi '), mention, ...text(' there')]

  test('backspace and forward delete expand to the entire token', () => {
    expect(replaceParts(parts, 6, 7, []).parts).toEqual(text('hi  there'))
    expect(replaceParts(parts, 3, 4, []).parts).toEqual(text('hi  there'))
    expect(replaceParts([command], 5, 6, []).parts).toEqual([])
    expect(atomicRange(parts, 4, 5)).toEqual({ start: 3, end: 7 })
  })

  test('replaces partial-token selections atomically and restores the caret', () => {
    const result = replaceParts(parts, 5, 9, text('new'))
    expect(composerText(result.parts)).toBe('hi newhere')
    expect(result.caret).toBe(6)
    expect(composerText(parts)).toBe('hi @Ada there')
  })

  test('inserts beside tokens and preserves safe literal paste text', () => {
    const result = replaceParts(parts, 7, 7, text('<img src=x>\n'))
    expect(result.parts[1]).toEqual(mention)
    expect(composerText(result.parts)).toBe('hi @Ada<img src=x>\n there')
    expect(replaceParts(parts, 0, 13, []).parts).toEqual([])
  })
})
