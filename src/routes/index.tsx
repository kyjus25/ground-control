import { createFileRoute } from '@tanstack/solid-router'
import { SatelliteDish } from 'lucide-solid'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div class="flex min-h-screen items-center justify-center bg-stone-50">
      <div class="flex flex-col items-center gap-5 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900">
          <SatelliteDish class="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Ground Control</h1>
          <p class="mt-1 text-sm text-stone-400">Mission control for your personal AI crew.</p>
        </div>
        <span class="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs text-stone-600">
          Hello, world — the scaffold is live
        </span>
      </div>
    </div>
  )
}
