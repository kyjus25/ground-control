import { createFileRoute } from '@tanstack/solid-router'
import {
  AlertTriangle,
  Bot,
  Clock,
  Gauge,
  Globe,
  ShieldQuestion,
} from 'lucide-solid'
import type { JSX } from 'solid-js'

type IconComponent = (props: { class?: string }) => JSX.Element

export const Route = createFileRoute('/_layout/')({
  head: () => ({
    meta: [{ title: 'Ground Control' }],
  }),
  component: Dashboard,
})

function Dashboard() {
  return (
    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-6">
        <h1 class="text-[15px] font-medium">Dashboard</h1>
      </header>

      <div class="flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        <div class="mx-auto w-full max-w-3xl space-y-8">
          {/* Status strip */}
          <div class="grid grid-cols-3 gap-3">
            <Stat icon={Bot} label="Bots online" value="3 / 4" />
            <Stat icon={Clock} label="Jobs due today" value="2" />
            <Stat icon={Gauge} label="Tokens this week" value="128k" />
          </div>

          {/* Needs attention */}
          <section>
            <h2 class="mb-2 text-[13px] text-stone-400">Needs attention</h2>
            <div class="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
              <AttentionRow
                icon={AlertTriangle}
                iconClass="bg-amber-100 text-amber-700"
                title="Price watch failed twice overnight"
                detail="Scout · job disabled after retry limit"
              />
              <AttentionRow
                icon={Globe}
                iconClass="bg-stone-100 text-stone-600"
                title="Fixit is stuck on a browser checkpoint"
                detail="Waiting for your review · 2 hours"
              />
            </div>
          </section>

          {/* Permission approvals */}
          <section>
            <h2 class="mb-2 text-[13px] text-stone-400">Permission approvals</h2>
            <div class="space-y-3">
              <ApprovalCard
                title="Fixit wants to submit the renewal form"
                detail="Browser checkpoint · payments.example.com"
              />
              <ApprovalCard
                title="Scout asks to install a research skill"
                detail="Skill grant · deep-research-pro"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function Stat(props: { icon: IconComponent; label: string; value: string }) {
  const Icon = props.icon
  return (
    <div class="rounded-xl border border-stone-200 bg-white p-4">
      <div class="flex items-center gap-1.5 text-xs text-stone-400">
        <Icon class="h-3.5 w-3.5" />
        {props.label}
      </div>
      <div class="mt-1 text-xl font-semibold tracking-tight">{props.value}</div>
    </div>
  )
}

function AttentionRow(props: {
  icon: IconComponent
  iconClass: string
  title: string
  detail: string
}) {
  const Icon = props.icon
  return (
    <div class="flex items-center gap-3 p-4">
      <span
        class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${props.iconClass}`}
      >
        <Icon class="h-4 w-4" />
      </span>
      <div class="min-w-0">
        <div class="text-sm font-medium">{props.title}</div>
        <div class="truncate text-xs text-stone-400">{props.detail}</div>
      </div>
    </div>
  )
}

function ApprovalCard(props: { title: string; detail: string }) {
  return (
    <div class="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
        <ShieldQuestion class="h-4 w-4" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium">{props.title}</div>
        <div class="truncate text-xs text-stone-400">{props.detail}</div>
      </div>
      <div class="flex shrink-0 gap-2">
        <button class="cursor-pointer rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">
          Deny
        </button>
        <button class="cursor-pointer rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-600">
          Approve
        </button>
      </div>
    </div>
  )
}
