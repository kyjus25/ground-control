import { createFileRoute, redirect, useNavigate } from '@tanstack/solid-router'
import BotEditorForm from '../shared/BotEditorForm'
import { AuthShell } from './-/AuthShell'
import { getSessionUser } from '../server/auth'
import { listBots } from '../server/bots'

export const Route = createFileRoute('/onboarding')({
  head: () => ({
    meta: [{ title: 'Welcome · Ground Control' }],
  }),
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (!user) throw redirect({ to: '/login' })
    // First-run onboarding only — skip once the crew exists.
    const bots = await listBots()
    if (bots.length > 0) throw redirect({ to: '/' })
  },
  component: Onboarding,
})

function Onboarding() {
  const navigate = useNavigate()
  return (
    <AuthShell subtitle="Name your first bot to get started">
      <BotEditorForm bot={null} onDone={() => navigate({ to: '/' })} />
    </AuthShell>
  )
}
