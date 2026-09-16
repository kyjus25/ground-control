import { describe, expect, test } from 'bun:test'
import type { Element, Root } from 'hast'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { rehypeMentions, splitMentions } from './MentionText'

const members = [{ name: 'Scout' }, { name: 'Ann' }, { name: 'Ann Lee' }] as const
const mentions = (text: string, names = members as readonly { name: string }[]) =>
  splitMentions(text, names).filter((part) => part.mention).map((part) => part.text)

const markdownTree = (text: string) => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeMentions, members)
  return processor.runSync(processor.parse(text)) as Root
}

const elements = (tree: Root | Element): Element[] =>
  tree.children.flatMap((child) => child.type === 'element' ? [child, ...elements(child)] : [])

const highlighted = (tree: Root) => elements(tree).filter((node) => node.tagName === 'span')

describe('splitMentions', () => {
  test('highlights only known members case insensitively, preserving original spelling', () => {
    expect(mentions('@SCOUT, @unknown and (@ann)! @Scout.')).toEqual(['@SCOUT', '@ann', '@Scout'])
  })

  test('prefers full multiword names to overlapping shorter names', () => {
    expect(mentions('@Ann Lee, @ANN LEE! @Ann @Ann Leeway')).toEqual([
      '@Ann Lee', '@ANN LEE', '@Ann', '@Ann',
    ])
    expect(mentions('@Ann', [{ name: 'Ann Lee' }])).toEqual([])
  })

  test('rejects emails, embedded mentions, and partial identifiers', () => {
    expect(mentions('person@Scout.com person+tag@Scout @Scout.com @@Scout x@Ann')).toEqual([])
    expect(mentions('@Scouting @Scout2 @Scout_extra @Scout-bot @Scouté @Scout\u0301')).toEqual([])
    expect(mentions('é@Scout 中@Scout')).toEqual([])
  })

  test('treats regex metacharacters in names literally', () => {
    const names = [{ name: 'C++' }, { name: 'A.B' }, { name: 'Bot (QA)' }, { name: '[x]' }]
    expect(mentions('@C++ @A.B @Bot (QA) @[x] @AxB @CC', names)).toEqual([
      '@C++', '@A.B', '@Bot (QA)', '@[x]',
    ])
  })

  test('supports Unicode names and punctuation boundaries', () => {
    expect(mentions('(@ÉLODIE), @小明!', [{ name: 'Élodie' }, { name: '小明' }])).toEqual([
      '@ÉLODIE', '@小明',
    ])
  })

  test('retains every whitespace character and raw user text', () => {
    const text = '  <b>hello</b>\n\t@Scout  **@Ann Lee**\n\n '
    expect(splitMentions(text, members).map((part) => part.text).join('')).toBe(text)
    expect(splitMentions('', members).map((part) => part.text).join('')).toBe('')
    expect(splitMentions('@Scout', [])).toEqual([{ text: '@Scout', mention: false }])
    expect(mentions('@ @Scout', [{ name: '' }, { name: '   ' }])).toEqual([])
  })

  test('uses the supplied current text and membership on each call', () => {
    expect(mentions('@Sco')).toEqual([])
    expect(mentions('@Scout')).toEqual(['@Scout'])
    expect(mentions('@Scout', [{ name: 'Ann' }])).toEqual([])
  })
})

describe('rehypeMentions', () => {
  test('preserves Markdown structure while highlighting eligible text nodes', () => {
    const tree = markdownTree('# Hello @Scout\n\n**@Ann Lee** and *welcome*\n\n- @Scout\n- other\n\n> @Ann')
    expect(elements(tree).map((node) => node.tagName)).toEqual([
      'h1', 'span', 'p', 'strong', 'span', 'em', 'ul', 'li', 'span', 'li', 'blockquote', 'p', 'span',
    ])
    expect(highlighted(tree)).toHaveLength(4)
    for (const node of highlighted(tree)) {
      expect(node.properties).toEqual({ className: ['font-medium', 'text-green-700'] })
      expect(node.children[0].type).toBe('text')
    }
  })

  test('skips inline code, fenced code, and link descendants', () => {
    const tree = markdownTree('`@Scout`\n\n```text\n@Ann Lee\n```\n\n[**@Scout**](https://example.com) and @Ann')
    expect(highlighted(tree).map((node) => node.children)).toEqual([
      [{ type: 'text', value: '@Ann' }],
    ])
    const link = elements(tree).find((node) => node.tagName === 'a')!
    expect(link.properties?.href).toBe('https://example.com')
    expect(elements(link).map((node) => node.tagName)).toEqual(['strong'])
    for (const node of elements(tree).filter((node) => ['code', 'pre'].includes(node.tagName))) {
      expect(elements(node).some((child) => child.tagName === 'span')).toBe(false)
    }
  })

  test('does not turn HTML or member names into injected markup', () => {
    const tree = markdownTree('<script>@Scout</script>\n\n![alt @Scout](image.png)\n\n&lt;b&gt; @Scout')
    expect(elements(tree).some((node) => node.tagName === 'script')).toBe(false)
    expect(elements(tree).find((node) => node.tagName === 'img')?.properties?.alt).toBe('alt @Scout')
    expect(highlighted(tree)).toHaveLength(1)
    const literal: Root = { type: 'root', children: [{ type: 'text', value: '@<b>' }] }
    rehypeMentions([{ name: '<b>' }])(literal)
    expect(highlighted(literal)[0].children).toEqual([{ type: 'text', value: '@<b>' }])
  })
})
