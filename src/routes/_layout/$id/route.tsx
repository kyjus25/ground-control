import { createFileRoute } from '@tanstack/solid-router'
import { Sidebar } from './-/Sidebar'
import { Thread } from './-/Thread'

export const Route = createFileRoute('/_layout/$id')({
  head: () => ({
    meta: [{ title: 'Ground Control' }],
  }),
  component: Workspace,
})

function Workspace() {
  return (
    <>
      <Thread />
      <Sidebar />
    </>
  )
}
