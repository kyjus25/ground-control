import { useRouter } from '@tanstack/solid-router'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { createCommandController, type CommandOptions } from './command-controller'

export function createThreadConnection() {
  const connection = fetchServerSentEvents('/api/chat')
  const hydrate = connection.hydrate
  let generation = 0
  if (hydrate) connection.hydrate = async (...args) => {
    const current = generation
    const result = await hydrate(...args)
    return current === generation ? result : { messages: [], activeRun: null, interrupts: null }
  }
  return { connection, invalidate: () => { generation++ } }
}

export function createThreadCommands(options: CommandOptions) {
  const router = useRouter()
  return createCommandController({
    ...options,
    request: (command) => fetch('/api/chat-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: options.threadId, command }),
    }),
    refreshHistory: async () => {
      for (const match of router.state.matches) {
        if (match.routeId === '/_layout/$id' && match.params.id === options.threadId && match.loaderData) {
          match.loaderData.history.splice(0)
        }
      }
      const filter = (match: { routeId: string; params: { id?: string } }) => match.routeId === '/_layout/$id' && match.params.id === options.threadId
      router.clearCache({ filter })
      await router.invalidate({ filter, sync: true })
    },
  })
}
