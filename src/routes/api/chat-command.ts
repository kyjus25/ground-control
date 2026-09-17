import { createFileRoute } from '@tanstack/solid-router'
import { getSessionUser } from '../../server/auth'
import { executeChatCommand } from '../../server/chat-commands'

export const Route = createFileRoute('/api/chat-command')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getSessionUser()
        return executeChatCommand(user?.id ?? null, await request.json().catch(() => null))
      },
    },
  },
})
