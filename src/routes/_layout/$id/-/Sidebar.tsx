import Pin from 'lucide-solid/icons/pin'
import Plus from 'lucide-solid/icons/plus'

// Workspace right rail — always open per PRD §4. Sections: browser session
// activity, pinned messages, and jobs targeting this workspace.
export function Sidebar() {
  return (
    <aside class="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-stone-200 bg-stone-100">
      {/* Browser — live view of the workspace's shared browser (placeholder) */}
      <div class="border-b border-stone-200 px-5 pt-6 pb-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[13px] font-medium">Browser</h3>
          <span class="flex items-center gap-1.5 text-xs text-stone-400">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
            live
          </span>
        </div>
        <div class="aspect-video rounded-lg bg-black" title="Shared browser session (placeholder)" />
      </div>

      {/* Pinned messages */}
      <div class="border-b border-stone-200 px-5 pt-5 pb-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="flex items-center gap-1.5 text-[13px] font-medium">
            <Pin class="h-3.5 w-3.5" />
            Pinned
          </h3>
          <button class="cursor-pointer text-stone-400 hover:text-stone-900" title="Pin a message">
            <Plus class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="space-y-2">
          <div class="rounded-lg border border-stone-200 bg-white p-2.5">
            <div class="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium">
              <span class="text-sm">🧭</span>
              Scout
              <span class="ml-auto text-xs font-normal text-stone-400">10:33</span>
            </div>
            <p class="line-clamp-2 text-xs leading-relaxed text-stone-600">
              Recommendation: SSE for delivery, SQLite for history.
            </p>
          </div>
          <div class="rounded-lg border border-stone-200 bg-white p-2.5">
            <div class="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium">
              <span class="text-sm">🔥</span>
              Blaze
              <span class="ml-auto text-xs font-normal text-stone-400">10:34</span>
            </div>
            <p class="line-clamp-2 text-xs leading-relaxed text-stone-600">
              Bots reply to @mentions only, with a reply depth of 3 so crews can't loop.
            </p>
          </div>
        </div>
      </div>

      {/* Jobs */}
      <div class="px-5 pt-5 pb-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[13px] font-medium">Jobs</h3>
          <button class="cursor-pointer text-stone-400 hover:text-stone-900">
            <Plus class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="space-y-3">
          <div class="flex items-start gap-2.5">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            <div>
              <div class="text-[13px]">Morning news digest</div>
              <div class="text-xs text-stone-400">daily at 7:00 · Scout</div>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            <div>
              <div class="text-[13px]">Price watch</div>
              <div class="text-xs text-stone-400">every 30 min · Scout</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
