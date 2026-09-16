import { Outlet, createFileRoute, redirect } from '@tanstack/solid-router'
import { Navigation } from './-/Navigation'
import { getSessionUser } from '../../server/auth'

// Shared shell for all authenticated pages: the Navigation is ever-present.
// Auth is checked here; the zero-bots → onboarding rule lives where the bot
// count can actually change (dashboard route, login/signup, bot deletion),
// not here, where it would re-run on every route validation.
export const Route = createFileRoute('/_layout')({
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (!user) throw redirect({ to: '/login' })
  },
  component: Layout,
})

function Layout() {
  return (
    <div class="flex h-screen overflow-hidden">
      <Navigation />
      <Outlet />
    </div>
  )
}
