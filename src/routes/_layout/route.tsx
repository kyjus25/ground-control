import { Outlet, createFileRoute, redirect } from '@tanstack/solid-router'
import { createSignal } from 'solid-js'
import Menu from 'lucide-solid/icons/menu'
import { Drawer } from '../../shared/Drawer'
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
  const [navOpen, setNavOpen] = createSignal(false)
  return (
    <div class="flex h-dvh overflow-hidden">
      {/* Mobile top bar (the nav itself becomes a drawer below md) */}
      <div class="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-stone-200 bg-stone-100 px-3 md:hidden">
        <button
          class="cursor-pointer rounded-lg p-2 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
          title="Menu"
          onClick={() => setNavOpen(true)}
        >
          <Menu class="h-5 w-5" />
        </button>
        <span class="text-[15px] font-medium tracking-tight">Ground Control</span>
      </div>

      {/* One Navigation instance: inline panel on desktop (first in flex order),
          slide-in drawer on mobile. */}
      <Drawer
        side="left"
        inlineAt="md"
        open={navOpen()}
        onClose={() => setNavOpen(false)}
        class="w-64"
      >
        <Navigation onNavigate={() => setNavOpen(false)} />
      </Drawer>

      <div class="flex min-w-0 flex-1 pt-14 md:pt-0">
        <Outlet />
      </div>
    </div>
  )
}
