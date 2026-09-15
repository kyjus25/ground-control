import { Server } from 'lucide-solid'
import type { Host } from '../../../types/host'

// Placeholder settings panel — host management lands in M2.
const hosts: Host[] = [
  {
    name: 'atlas',
    kind: 'Cloud · us-east · 3 bots',
    status: 'Connected',
    dot: 'bg-green-500',
  },
  {
    name: 'home',
    kind: 'Local · Ollama · 1 bot',
    status: 'Degraded',
    dot: 'bg-amber-400',
  },
]

export default function SettingsContent() {
  return (
    <div class="space-y-6">
      <section>
        <h3 class="mb-2 text-[13px] text-stone-400">Hosts</h3>
        <div class="divide-y divide-stone-200 rounded-xl border border-stone-200">
          {hosts.map((host) => (
            <div class="flex items-center gap-3 p-3">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                <Server class="h-4 w-4" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium">{host.name}</div>
                <div class="truncate text-xs text-stone-400">{host.kind}</div>
              </div>
              <span class="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
                <span class={`h-1.5 w-1.5 rounded-full ${host.dot}`} />
                {host.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <p class="text-xs leading-relaxed text-stone-400">
        Hosts, model assignments, budgets, and skills management land in M2. Everything here is a
        placeholder for now.
      </p>
    </div>
  )
}
