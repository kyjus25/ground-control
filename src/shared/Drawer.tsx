import { type JSX } from 'solid-js'

type DrawerProps = {
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  /** Breakpoint where the drawer becomes a permanently-visible inline panel
      (desktop layout), so children render exactly once across form factors. */
  inlineAt?: 'md' | 'lg'
  /** Panel width classes, e.g. `w-64`. */
  class?: string
  children: JSX.Element
}

// Tailwind can't build responsive variants dynamically, so predeclare the
// per-breakpoint escape hatches that switch overlay mode back to inline.
const INLINE_ROOT: Record<'md' | 'lg', string> = {
  md: 'md:static md:z-auto md:block',
  lg: 'lg:static lg:z-auto lg:block',
}
const INLINE_BACKDROP: Record<'md' | 'lg', string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
}
const INLINE_PANEL: Record<'md' | 'lg', string> = {
  md: 'md:static md:shadow-none',
  lg: 'lg:static lg:shadow-none',
}

// Slide-in drawer for small screens. Unlike Dialog, children stay mounted;
// `open` only controls visibility below the `inlineAt` breakpoint.
export function Drawer(props: DrawerProps) {
  const at = () => props.inlineAt
  return (
    <div
      class={`fixed inset-0 z-50 ${props.open ? 'flex' : 'hidden'} ${at() ? INLINE_ROOT[at()!] : ''}`}
    >
      <div
        class={`absolute inset-0 bg-stone-900/40 ${at() ? INLINE_BACKDROP[at()!] : ''}`}
        onClick={() => props.onClose()}
      />
      <div
        class={`absolute inset-y-0 ${props.side === 'left' ? 'left-0' : 'right-0'} flex shadow-xl ${at() ? INLINE_PANEL[at()!] : ''} ${props.class ?? ''}`}
      >
        {props.children}
      </div>
    </div>
  )
}
