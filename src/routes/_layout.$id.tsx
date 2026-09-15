import { createFileRoute } from '@tanstack/solid-router'
import { Sidebar } from '../components/dashboard/Sidebar'
import { Thread } from '../components/dashboard/Thread'

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
