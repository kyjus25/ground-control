import { TanStackDevtools } from '@tanstack/solid-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/solid-router-devtools'
import { SolidQueryDevtoolsPanel } from '@tanstack/solid-query-devtools'
import { formDevtoolsPlugin } from '@tanstack/solid-form-devtools'
import { aiDevtoolsPlugin } from '@tanstack/solid-ai-devtools'
import { useQueryClient } from '@tanstack/solid-query'

// Dev-only unified devtools shell (@tanstack/solid-devtools) with one tab per
// TanStack library. Requires the `devtools()` vite plugin (vite.config.ts).
export default function Devtools() {
  const queryClient = useQueryClient()
  return (
    <TanStackDevtools
      plugins={[
        { name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> },
        {
          name: 'TanStack Query',
          render: <SolidQueryDevtoolsPanel client={queryClient} />,
        },
        formDevtoolsPlugin(),
        aiDevtoolsPlugin(),
      ]}
    />
  )
}
