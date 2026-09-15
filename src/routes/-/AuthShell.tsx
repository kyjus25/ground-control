import type { JSX } from 'solid-js'
import { SatelliteDish } from 'lucide-solid'

// Shared card layout for the login and signup pages.
export function AuthShell(props: { subtitle: string; children: JSX.Element }) {
  return (
    <div class="grid min-h-screen place-items-center bg-stone-50 px-4">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-4 text-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900">
            <SatelliteDish class="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Ground Control</h1>
            <p class="mt-1 text-sm text-stone-400">{props.subtitle}</p>
          </div>
        </div>

        <div class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          {props.children}
        </div>

        <p class="mt-6 text-center text-xs text-stone-400">Self-hosted · Ground Control v0.1</p>
      </div>
    </div>
  )
}
