import { createSignal } from 'solid-js'
import type { ChatCommand } from './composer-model'

export type CommandOptions = {
  threadId: string
  isLoading: () => boolean
  clear: () => void
  sendMessage: (text: string) => Promise<unknown>
  beforeSend?: () => void
}

export function createCommandController(options: CommandOptions & {
  request: (command: ChatCommand) => Promise<Response>
  refreshHistory: () => Promise<void>
}) {
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal('')
  const [notice, setNotice] = createSignal('')
  const busy = () => pending() || options.isLoading()

  const send = (text: string) => {
    if (busy()) return
    setError('')
    setNotice('')
    setPending(true)
    options.beforeSend?.()
    void options.sendMessage(text).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Message failed. Try again.')
    }).finally(() => setPending(false))
  }

  const command = async (command: ChatCommand) => {
    if (busy()) return false
    setPending(true)
    setError('')
    setNotice('')
    try {
      const response = await options.request(command)
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : null
        throw new Error(response.status === 409
          ? `This thread is busy. Wait for the reply to finish.${message ? ` ${message}` : ''}`
          : message ?? 'Command failed. Try again.')
      }
      if (command === 'clear') {
        options.clear()
        await options.refreshHistory().catch(() => {
          setError('Conversation cleared, but history could not refresh. Reload before continuing.')
        })
      }
      setNotice(result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
        ? result.message : command === 'clear' ? 'Conversation cleared.' : 'Context compacted. Your transcript is unchanged.')
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Command failed. Try again.')
      return false
    } finally {
      setPending(false)
    }
  }

  return { busy, error, notice, send, command }
}
