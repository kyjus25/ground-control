import { describe, expect, test } from 'bun:test'
import { createCommandController } from './command-controller'

function setup(overrides: Partial<Parameters<typeof createCommandController>[0]> = {}) {
  const calls: string[] = []
  const controller = createCommandController({
    threadId: 'thread',
    isLoading: () => false,
    clear: () => { calls.push('clear') },
    sendMessage: async () => { calls.push('send') },
    request: async (command) => { calls.push(command); return Response.json({ message: 'Done' }) },
    refreshHistory: async () => { calls.push('refresh') },
    ...overrides,
  })
  return { controller, calls }
}

describe('thread command controller', () => {
  test('clear runs immediately, clears the chat API and refreshes route history', async () => {
    const { controller, calls } = setup()
    expect(await controller.command('clear')).toBe(true)
    expect(calls).toEqual(['clear', 'clear', 'refresh'])
    expect(controller.notice()).toBe('Done')
    expect(controller.busy()).toBe(false)
  })

  test('compact preserves the transcript and displays the response notice', async () => {
    const { controller, calls } = setup()
    expect(await controller.command('compact')).toBe(true)
    expect(calls).toEqual(['compact'])
    expect(controller.notice()).toBe('Done')
  })

  test('cancel and active streaming never issue destructive requests', async () => {
    const streaming = setup({ isLoading: () => true })
    streaming.controller.send('hello')
    expect(await streaming.controller.command('compact')).toBe(false)
    expect(streaming.calls).toEqual([])
  })

  test('a pending command blocks sends and repeated commands', async () => {
    let finish!: (response: Response) => void
    const { controller, calls } = setup({ request: () => new Promise((resolve) => { finish = resolve }) })
    const pending = controller.command('compact')
    expect(controller.busy()).toBe(true)
    controller.send('hello')
    expect(await controller.command('clear')).toBe(false)
    expect(calls).toEqual([])
    finish(Response.json({ message: 'Compacted' }))
    expect(await pending).toBe(true)
    expect(controller.busy()).toBe(false)
  })

  test('409 and network failures preserve transcript and report errors', async () => {
    const conflict = setup({ request: async () => Response.json({ error: 'Thread busy' }, { status: 409 }) })
    expect(await conflict.controller.command('clear')).toBe(false)
    expect(conflict.calls).toEqual([])
    expect(conflict.controller.error()).toContain('This thread is busy.')
    expect(conflict.controller.error()).toContain('Thread busy')
    const failed = setup({ request: async () => { throw new Error('Offline') } })
    expect(await failed.controller.command('clear')).toBe(false)
    expect(failed.calls).toEqual([])
    expect(failed.controller.error()).toBe('Offline')
  })

  test('successful deletion is not retried when history refresh fails', async () => {
    const { controller, calls } = setup({ refreshHistory: async () => { throw new Error('Offline') } })
    expect(await controller.command('clear')).toBe(true)
    expect(calls).toEqual(['clear', 'clear'])
    expect(controller.error()).toContain('history could not refresh')
  })
})
