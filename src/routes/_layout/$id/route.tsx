import { createFileRoute } from '@tanstack/solid-router'
import { createSignal } from 'solid-js'
import { Drawer } from '../../../shared/Drawer'
import { Sidebar } from './-/Sidebar'
import { Thread } from './-/Thread'

export const Route = createFileRoute('/_layout/$id')({
  head: () => ({
    meta: [{ title: 'Ground Control' }],
  }),
  component: Workspace,
})

function Workspace() {
  // The right rail is a slide-in drawer below lg, inline above. One Sidebar.
  const [railOpen, setRailOpen] = createSignal(false)
  return (
    <>
      <Thread onOpenRail={() => setRailOpen(true)} />
      <Drawer
        side="right"
        inlineAt="lg"
        open={railOpen()}
        onClose={() => setRailOpen(false)}
        class="w-72"
      >
        <Sidebar />
      </Drawer>
    </>
  )
}
