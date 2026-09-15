import { ArrowUp, Download, Globe, Paperclip, Plus, RotateCcw, Search } from 'lucide-solid'

export function Thread() {
  return (
    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-6">
        <h1 class="text-[15px] font-medium">Weekend Project Crew</h1>
        <div class="-space-x-2 flex items-center">
          <div
            class="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-[11px] ring-2 ring-stone-100"
            title="Scout"
          >
            🧭
          </div>
          <div
            class="flex h-7 w-7 items-center justify-center rounded-md bg-orange-100 text-[11px] ring-2 ring-stone-100"
            title="Blaze"
          >
            🔥
          </div>
          <div
            class="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-[11px] font-medium text-stone-600 ring-2 ring-stone-100"
            title="Justin"
          >
            JW
          </div>
          <button
            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-stone-400/60 bg-white text-stone-400 ring-2 ring-stone-100 hover:text-stone-900"
            title="Add bot"
          >
            <Plus class="h-3 w-3" />
          </button>
        </div>
        <div class="ml-auto flex items-center gap-1 text-stone-400">
          <button class="cursor-pointer rounded-lg p-2 hover:bg-stone-200 hover:text-stone-900" title="Search">
            <Search class="h-4 w-4" />
          </button>
          <button class="cursor-pointer rounded-lg p-2 hover:bg-stone-200 hover:text-stone-900" title="Export">
            <Download class="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div class="flex-1 space-y-7 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
        {/* User */}
        <div class="mx-auto flex w-full max-w-3xl gap-3">
          <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[11px] font-medium text-stone-600">
            JW
          </div>
          <div class="min-w-0">
            <div class="mb-0.5 flex items-baseline gap-2">
              <span class="text-[13px] font-medium">Justin</span>
              <span class="text-xs text-stone-400">10:32</span>
            </div>
            <p class="text-sm leading-relaxed text-stone-600">
              <span class="font-medium text-green-700">@Scout</span> research the best approach for
              realtime bot-to-bot messaging. <span class="font-medium text-green-700">@Blaze</span>{' '}
              you'll architect it once Scout reports back.
            </p>
          </div>
        </div>

        {/* Scout */}
        <div class="bot-msg mx-auto flex w-full max-w-3xl gap-3">
          <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs">
            🧭
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-baseline gap-2">
              <span class="text-[13px] font-medium">Scout</span>
              <span class="text-xs text-stone-400">10:33</span>
            </div>
            <div class="space-y-2 text-sm leading-relaxed text-stone-600">
              <p>Three options after checking the landscape:</p>
              <ol class="list-inside list-decimal space-y-1 pl-1">
                <li>Shared event bus — SQLite WAL + polling, simplest for single-node</li>
                <li>Server-sent events — push-based, pairs well with Bun</li>
                <li>Message queue — overkill for now</li>
              </ol>
              <p>
                Recommendation: SSE for delivery, SQLite for history.{' '}
                <span class="font-medium text-green-700">@Blaze</span> thoughts?
              </p>
            </div>
            <div class="mt-1.5 flex items-center gap-3 text-xs text-stone-400">
              <span class="inline-flex items-center gap-1">
                <Globe class="h-3 w-3" /> 3 sources
              </span>
              <button class="inline-flex cursor-pointer items-center gap-1 hover:text-stone-600">
                <RotateCcw class="h-3 w-3" /> retry
              </button>
            </div>
          </div>
        </div>

        {/* Blaze */}
        <div class="bot-msg mx-auto flex w-full max-w-3xl gap-3">
          <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-100 text-xs">
            🔥
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-0.5 flex items-baseline gap-2">
              <span class="text-[13px] font-medium">Blaze</span>
              <span class="text-xs text-stone-400">10:34</span>
            </div>
            <div class="space-y-2 text-sm leading-relaxed text-stone-600">
              <p>Agreed. Flow I'd run:</p>
              <pre class="overflow-x-auto rounded-lg border border-stone-200 bg-white p-3 text-[12px] leading-relaxed text-stone-600">
                {`user msg ─▶ @Scout (research)
         ─▶ @Blaze (architecture)
         ─▶ executor bots (cron, browser)`}
              </pre>
              <p>
                One rule matters most: bots reply to{' '}
                <span class="font-medium text-green-700">@mentions</span> only, with a reply depth
                of 3 so crews can't loop. I'll draft the schema.
              </p>
            </div>
          </div>
        </div>

        {/* Typing */}
        <div class="bot-msg mx-auto flex w-full max-w-3xl items-center gap-3">
          <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs">
            🧭
          </div>
          <div class="flex items-center gap-2 text-[13px] text-stone-400">
            <span>Scout is writing</span>
            <span class="typing-dot h-1 w-1 rounded-full bg-stone-400" />
            <span class="typing-dot h-1 w-1 rounded-full bg-stone-400" />
            <span class="typing-dot h-1 w-1 rounded-full bg-stone-400" />
          </div>
        </div>
      </div>

      {/* Composer */}
      <div class="shrink-0 border-t border-stone-200 p-4">
        <div class="mx-auto w-full max-w-3xl">
          <div class="mb-2 flex flex-wrap gap-1.5">
            <span class="inline-flex items-center gap-1 rounded-full bg-green-100/60 px-2 py-0.5 text-xs text-stone-600">
              @Scout
            </span>
            <span class="inline-flex items-center gap-1 rounded-full bg-orange-100/60 px-2 py-0.5 text-xs text-stone-600">
              @Blaze
            </span>
          </div>
          <div class="flex items-end gap-2">
            <textarea
              rows="1"
              placeholder="Message the crew… type @ to mention a bot"
              class="flex-1 resize-none bg-transparent py-2 text-sm text-stone-600 placeholder-stone-400 focus:outline-none"
            />
            <button class="cursor-pointer p-2 text-stone-400 hover:text-stone-900" title="Attach">
              <Paperclip class="h-4 w-4" />
            </button>
            <button
              class="cursor-pointer flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-white hover:bg-stone-600"
              title="Send"
            >
              <ArrowUp class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
