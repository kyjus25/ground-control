import { Show, Suspense, createEffect, onCleanup, type JSX } from 'solid-js'
import X from 'lucide-solid/icons/x'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Extra classes for the panel, e.g. width: `max-w-2xl` */
  class?: string
  /** Close when the dimmed backdrop is clicked (default: true) */
  closeOnBackdrop?: boolean
  children: JSX.Element
}

// Native <dialog> wrapper. `open` drives showModal/close; Esc and the close
// button always close; backdrop clicks opt-in via closeOnBackdrop. Children
// mount only while open (so lazy-loaded content fetches on first open).
export function Dialog(props: DialogProps) {
  let ref!: HTMLDialogElement

  createEffect(() => {
    if (props.open && !ref.open) ref.showModal()
    else if (!props.open && ref.open) ref.close()
  })

  // If the parent unmounts us while open, leave the top layer cleanly.
  // Removing an open <dialog> from the DOM without close() corrupts the
  // top layer — every later showModal then renders without overlay/centering.
  onCleanup(() => {
    if (ref?.open) ref.close()
  })

  return (
    <dialog
      ref={ref}
      class={`m-auto w-[calc(100vw-1.5rem)] max-h-[85dvh] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-xl backdrop:bg-stone-900/40 backdrop:backdrop-blur-sm transition-[opacity,scale] duration-200 open:starting:opacity-0 open:starting:scale-[.97] ${
        props.class ?? ''
      }`}
      onClick={(e) => {
        if ((props.closeOnBackdrop ?? true) && e.target === ref) props.onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        props.onClose()
      }}
      onClose={() => props.onClose()}
    >
      <Show when={props.open}>
        <header class="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-4">
          <div class="min-w-0">
            <h2 class="text-[15px] font-medium">{props.title}</h2>
            <Show when={props.description}>
              <p class="mt-0.5 text-[13px] text-stone-400">{props.description}</p>
            </Show>
          </div>
          <button
            class="-mr-2 cursor-pointer rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-900"
            title="Close"
            onClick={() => props.onClose()}
          >
            <X class="h-4 w-4" />
          </button>
        </header>
        <div class="max-h-[calc(85dvh-4.5rem)] overflow-y-auto px-6 py-5">
          {/* Boundary INSIDE the panel: if dialog content reads a query that is
              (re)fetching, solid-query suspends its reader — without this the
              suspension bubbles to the boundary above, which swaps out (and
              thereby un-modalizes) the open <dialog> element itself. */}
          <Suspense fallback={null}>{props.children}</Suspense>
        </div>
      </Show>
    </dialog>
  )
}
