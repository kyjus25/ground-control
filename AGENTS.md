# AGENTS.md

Guidance for AI agents working in this repository. Product source of truth is
[PRD.md](PRD.md); where §6 and §8 conflict, §8 (Resolved Decisions) wins.

## Stack

- SolidJS + TanStack Start (Vite + Nitro, SSR enabled) — not plain Vite SPA
- TanStack Router, file-based routing
- Tailwind CSS v4 via `@tailwindcss/vite` — **stock palette only**
- Icons: `lucide-solid` (named imports; check `node_modules/lucide-solid/dist/types/icons/` for availability)
- Runtime/package manager: Bun

## Commands

```sh
bun install
bun run dev      # dev server on :5173
bun run build    # vite build + tsc --noEmit
bun run check    # typecheck only
bun run start    # serve .output/server/index.mjs
```

## File conventions

- Routes live in `src/routes/` using the **folder** convention — no dot
  notation. A folder's route is `route.tsx`; children are sibling files/folders.
  - `_layout/route.tsx` is the shell for all authenticated pages (Navigation is
    ever-present). `login.tsx` sits outside it.
- **`-` folders are ignored by the router.** Colocate route-specific components
  in a `-` folder next to their closest route
  (e.g. `routes/_layout/-/`, `routes/_layout/$id/-/`).
- `src/shared/` is only for components used by **more than one route**.
- `src/types/` holds domain types (`Bot`, `Host`, …). Both routes/components and
  future server code import from here — keep these shapes UI-agnostic where
  possible so they can describe the API.
- **No barrel files** (`index.ts` re-exports). Import from the specific file:
  `import type { Bot } from '../../types/bot'`.
- `src/routes/routeTree.gen.ts` is generated — never edit or commit it.
- SSR is on: guard `window`/`document` usage in components.

## Design guide

Light, soft, minimal, elegant: warm paper-white content, sand-tinted sidebars,
muted earthy accents. Explicitly not a dark-purple-gradient "AI startup" look.

### Colors — stock Tailwind only, never custom `@theme` color tokens

| Role                          | Token              |
| ----------------------------- | ------------------ |
| Page/content background       | `stone-50`         |
| Sidebar/panel background      | `stone-100`        |
| Borders, dividers, lines      | `stone-200`        |
| Row hover tint                | `stone-200`        |
| Primary text / filled buttons | `stone-900`        |
| Body text                     | `stone-600`        |
| Muted text, timestamps        | `stone-400`        |
| Status dots ("traffic lights")| `green-500`        |
| @mentions, links (text)       | `green-700`        |
| Bot avatar pastels            | `green-100`, `blue-100`, `orange-100`, `violet-100` |

### Layout & components

- Thread header/title and nav brand: `text-[15px] font-medium`, aligned in
  `h-14` rows (`items-center`, no ad-hoc padding).
- Section labels: `text-[13px] text-stone-400`. Timestamps: `text-xs`.
- Nav rows: always render the border (`border` + `border-transparent` when
  inactive) to avoid layout shift. Active row is a flat white card
  (`border-stone-200 bg-white`, no shadow, no hover). Inactive hover:
  `hover:bg-stone-200`.
- Every clickable (`button`, `a`, `Link`) gets an explicit `cursor-pointer`
  class — no global cursor CSS.
- Clicking the active workspace link or the logo deselects back to `/`.
- Scroll containers use `[scrollbar-gutter:stable]` to prevent shifts.
- Bot identity = emoji + pastel bg + geometric shape: `rounded-full`,
  `rounded-md`, or the `shape-hex` / `shape-tri` utilities in `style.css`.
  Offline bots: row at `opacity-50` with a `stone-200` dot.
- Thread right sidebar sections: Browser (live shared browser view — black
  placeholder until M8), Pinned, Jobs.
- Animations in `style.css`: `.bot-msg` fade-up, `.typing-dot` blink.
