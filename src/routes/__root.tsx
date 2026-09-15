/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'
import { Suspense, lazy } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import type * as Solid from 'solid-js'
import styleCss from '../../style.css?url'

const favicon =
  'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📡</text></svg>'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Ground Control' },
      { name: 'description', content: 'Mission control for your personal AI crew.' },
    ],
    links: [
      { rel: 'stylesheet', href: styleCss },
      { rel: 'icon', href: favicon },
    ],
  }),
  // Devtools live inside the router tree (this component), not in the
  // document shell, so the router context reaches them.
  component: RootComponent,
  shellComponent: RootDocument,
})

function RootComponent() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      )}
    </>
  )
}

// Lazily loaded: devtools code never ships in the initial page load.
const Devtools = lazy(() => import('./-/Devtools'))

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
