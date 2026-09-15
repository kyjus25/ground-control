import { TanStackDevtools } from '@tanstack/solid-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/solid-router-devtools'
import { useRouter } from '@tanstack/solid-router'

// Dev-only. Loaded lazily so production bundles never include devtools code.
export default function Devtools() {
  const router = useRouter()
  return (
    <TanStackDevtools
      config={{ triggerMode: 'fixed', position: 'bottom-right' }}
      plugins={[
        {
          name: 'TanStack Router',
          render: () => (
            <TanStackRouterDevtoolsPanel
              router={router}
              isOpen={true}
              style={{ height: '100%' }}
            />
          ),
        },
      ]}
    />
  )
}
