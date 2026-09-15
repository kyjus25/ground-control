import { createFileRoute } from '@tanstack/solid-router'
import { SatelliteDish } from 'lucide-solid'

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [{ title: 'Sign in · Ground Control' }],
  }),
  component: Login,
})

function Login() {
  return (
    <div class="grid min-h-screen place-items-center bg-stone-50 px-4">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-4 text-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900">
            <SatelliteDish class="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Ground Control</h1>
            <p class="mt-1 text-sm text-stone-400">Sign in to your crew's mission control</p>
          </div>
        </div>

        <form
          class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
          onSubmit={(e) => e.preventDefault()}
        >
          <label for="email" class="mb-1.5 block text-[13px] font-medium text-stone-600">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            class="mb-4 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
          />

          <div class="mb-1.5 flex items-baseline justify-between">
            <label for="password" class="block text-[13px] font-medium text-stone-600">
              Password
            </label>
            <a href="#" class="cursor-pointer text-xs text-stone-400 hover:text-stone-600">
              Forgot?
            </a>
          </div>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            class="mb-5 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
          />

          <button
            type="submit"
            class="w-full cursor-pointer rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-600"
          >
            Sign in
          </button>
        </form>

        <p class="mt-6 text-center text-xs text-stone-400">Self-hosted · Ground Control v0.1</p>
      </div>
    </div>
  )
}
