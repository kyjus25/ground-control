# Ground Control

Mission control for your personal AI crew.

Ground Control is a self-hosted platform for running a personal crew of AI bots. Each bot has a persistent identity (emoji, color, shape), a soul, skills, and its own LLM + provider. Bots live in group chats where you @mention them — and they can message each other directly, with or without you in the loop.

## Highlights

- **Bots as people** — identity, soul, instructions, skills, model assignment, and a persistent memory file per bot
- **Group chats** — @mention bots into any conversation, with reply-depth controls to prevent loops
- **Bot-to-bot DMs** — bots can always message each other; group chats are the venue, not the permission
- **Workspaces** — every bot and chat is a UUID with its own folder structure for shared assets and files
- **Cron jobs** — bots create and run scheduled tasks; every job records who initiated it and where output lands
- **Browser** — Playwright-powered browsing per workspace, logged into the chat's activity feed
- **Durable streaming** — stream + persist everywhere, so no message is lost on reconnect

## Stack

SolidJS + TanStack Start · TanStack AI · Bun · PostgreSQL (Drizzle) · Docker Compose · Playwright · Tailwind · Lucide

## Status

M1 foundation started — SolidJS + TanStack Start (SSR-ready) + Tailwind shell scaffolded. See [PRD.md](PRD.md) for the full product requirements document.

## Getting started

```sh
bun install
bun run dev      # start the dev server
bun run build    # production build
bun run check    # typecheck
```
