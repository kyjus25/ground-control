import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: { port: 5173 },
  // The devtools plugin must come first in the list.
  plugins: [devtools(), tailwindcss(), tanstackStart(), solid({ ssr: true }), nitro()],
})
