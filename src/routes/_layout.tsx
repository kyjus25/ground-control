import { Outlet, createFileRoute } from '@tanstack/solid-router'
import { Navigation } from '../components/dashboard/Navigation'

// Shared shell for all authenticated pages: the Navigation is ever-present.
export const Route = createFileRoute('/_layout')({
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
