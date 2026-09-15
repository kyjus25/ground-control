import { Outlet, createFileRoute, redirect } from '@tanstack/solid-router'
import { Navigation } from './-/Navigation'
import { getSessionUser } from '../../server/auth'

// Shared shell for all authenticated pages: the Navigation is ever-present.
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
