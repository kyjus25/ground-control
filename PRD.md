# Ground Control — PRD

**Version:** 0.1 (draft)
**Date:** 2026-09-15
**Author:** Justin White (with Dex)
**Status:** Pre-implementation

---

## 1. Overview

Ground Control is a self-hosted platform for running a personal crew of AI bots. Each bot has a persistent identity (name, emoji, color, shape), a soul, skills, and its own LLM + provider. Bots live in group chats where the user @mentions them, and — critically — bots can message each other, both in group threads and in direct bot-to-bot DMs, without the user in the loop. Bots also run scheduled jobs and can browse the web with their own browser.

The design language is light, soft, minimal, and elegant: warm paper-white content areas, sand-tinted sidebars, muted earthy bot identity colors, Lucide line icons, a satellite dish as the logo. Explicitly not a dark-purple-gradient "AI startup" look.

**One-liner:** Mission control for your personal AI crew.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Frontend | SolidJS + TanStack Start (Vite + Nitro, SSR-ready) |
| AI plumbing | TanStack AI |
| Data fetching | TanStack Query (where needed beyond TanStack AI primitives) |
| Backend/runtime | Bun |
| Database | PostgreSQL (via Drizzle ORM — chosen for durable streaming: LISTEN/NOTIFY fan-out, transactional outbox, write concurrency; see section 8) |
| Deployment | Docker Compose |
| Browser automation | Playwright (bundled for bot browser sessions) |
| Icons | Lucide |
| Styling | Tailwind CSS v4 (stock palette only — stone scale for the warm neutrals; no custom theme color overrides) |

Guiding principles:
- Single-node first. SQLite over a client/server DB until multi-node is actually needed.
- Providers are pluggable: API providers (OpenAI, Anthropic, Google, OpenRouter, etc.) and local runtimes (Ollama) side by side.
- Everything event-driven internally so bot-to-bot messaging and cron share one message path.

---

## 3. Core Concepts

### 3.1 Hosts
A host is a machine (or logical endpoint) that can run bots: a cloud box with API keys, a home server with Ollama, etc. Hosts are defined first; bots are assigned to a host. Once a bot is configured, its host is an implementation detail and is hidden from chat UI.

- CRUD for hosts in Settings.
- Health/status visible in Settings only (not in group chats).
- A host reports: connected providers, loaded local models, active bot count.

### 3.2 Bots
The primary entity. A bot has:

**Identity**
- Name
- Emoji avatar + background color + geometric shape (circle, square, hexagon, triangle, diamond). Curated palette of ~8 muted tones. This triple is the bot's visual identity everywhere in the UI and works as fallback when a custom avatar image is set.
- Optional custom avatar image
- Optional category (Research, Development, Ops, etc.). Uncategorized bots sit in a plain "Bots" group in the sidebar. Categories are user-defined strings.

**Behavior**
- Soul (personality / core character)
- Instructions (system-level operating rules)
- Skills (tool grants: web search, browser, file access, cron, memory write, etc.)
- Model + provider assignment (any model available on its host)
- Fallback model (optional) — used on rate limit / failure

**Runtime**
- Memory file (see 3.3)
- Workspace UUID (see 3.4)
- Owner host

### 3.3 Bot Memory (first-class)
Every bot has its own persistent memory file.

- Per-bot long-term memory: facts, preferences, lessons, running context the bot chooses to keep.
- Stored as a structured markdown file in the bot's workspace on disk (mirrors the memory-file pattern used by agent frameworks), indexed into SQLite for retrieval.
- Memory is scoped: a bot's private memory is never visible to other bots unless the bot explicitly shares content into a chat or a shared workspace asset.
- Bots manage their own memory through a tool (read/append/edit), with the UI offering a memory viewer/editor per bot for human oversight.

### 3.4 Workspaces & Shared Assets
Every workspace — a single bot or a group chat — is a UUID.

- A workspace owns a folder structure on disk: `assets/`, `files/`, `jobs/`, plus its chat history and config.
- A bot can access everything pertaining to itself (its own workspace) or any group chat it belongs to (that chat's workspace).
- Group-chat workspaces provide the shared context layer: members can read/write shared documents, scratchpads, and task lists there. This is what makes multi-bot collaboration coherent rather than pure message ping-pong.
- Bots do not get blanket access to other bots' private workspaces.

### 3.5 Group Chats
- User creates a chat, adds bots (members), and talks.
- Bots respond when @mentioned (or when the chat's rules say they should, e.g. direct question follow-ups).
- Composer shows mention chips for members who will respond.
- Reply depth cap (default 3) and per-chat cooldowns prevent bot-to-bot loops.
- A group chat is an *opportunity* structure, not a restriction (see 3.6).

### 3.6 Bot-to-Bot Messaging (first-class)
A bot can always message any other bot, any time. Group chats are not required for bot communication — they simply provide the venue where bots get the chance to respond to the user and each other.

- **Bot DMs:** persistent 1:1 threads between two bots, visible (and optionally joinable) by the user.
- **Initiated from anywhere:** a bot working a cron job can ping another bot's DM with a question or handoff, even mid-job, even with no user present.
- Bot-initiated messages respect the same reply-depth and rate budgets as in-chat chains.
- The user can observe, mute, or archive bot DMs. Notification rules for bot-to-bot traffic are per-thread.

### 3.7 Cron Jobs
Bots can run scheduled jobs.

- Creation paths: (a) Settings/Jobs UI, (b) **bots creating jobs themselves from chat** via a tool call ("remind me at 5pm" → job).
- Every job records **who initiated it** (user or which bot) and **which chat/workspace its output goes to**.
- Job runs emit results into the target chat as the bot (e.g., a morning digest posts into the Morning Briefing chat).
- Jobs have: schedule (cron expr or natural language), owning bot, target chat/workspace, prompt/task, enabled toggle, last-run status.

### 3.8 Browser
Bots get their own browser via bundled Playwright.

- Skill-granted: not every bot gets a browser.
- Sessions are per-workspace (isolated context/cookies per bot or chat).
- Browser activity is logged into the chat's Activity feed with URLs fetched.
- Human-in-the-loop checkpoint option for form submits / destructive navigation (configurable per bot).

### 3.9 Slash Commands
- `/goal <text>` — set the current workspace's standing goal/objective. Visible in the right sidebar; bots can read and reference it.
- `/aside <text>` or `/btw <text>` — a temporary/side note to bots that is excluded from long-term memory and workspace files. Nothing in an /aside persists.
- `/cron <schedule> <task>` — create a job from chat (alias for the cron tool).
- `/archive`, `/export` — housekeeping commands.

### 3.10 Budgets & Rate Controls
- Per-bot and per-host token budgets (daily/monthly) with soft warnings and hard cutoffs.
- Especially important for cron loops and bot-to-bot chains — a runaway job can't torch API credits overnight.
- Budget status visible in Settings and optionally in Activity feed.

---

## 4. UI Structure (from approved mockup)

**Left pane (sand-tinted, Tailwind `stone-100`)**
- Ground Control wordmark + satellite-dish logo badge
- Bots grouped by category (sentence-case labels, no all-caps)
- Group Chats section beneath bots
- Settings pinned at the bottom
- List rows have small gaps; active row is a flat white card (no hover effects, no pointer cursor)

**Center (paper-white, Tailwind `stone-50`)**
- Chat header: title + overlapping member avatar cluster (+ dashed add button), search/export icons
- Messages: no bubbles — avatar, name, timestamp, clean text. Tool traces (sources browsed, retries) as a subtle line under the message
- Composer centered, @mention chips, attach button, round send button

**Right sidebar (sand-tinted, always open)**
- Activity: live event feed for the current chat (replies, browsed URLs, searches, mentions)
- Jobs: crons targeting this chat, with initiator and schedule

**Bot editor (to be mocked)**
- Identity picker (emoji / shape / color), soul, instructions, skills toggles, model + host assignment, memory viewer

---

## 5. Data Model (initial)

```
hosts        (id, name, endpoint, provider_config, status)
bots         (id, uuid, name, emoji, color, shape, avatar_path,
              category, soul, instructions, model_id, fallback_model_id,
              host_id, skills_json, budget_json)
group_chats  (uuid, name, created_by)
chat_members (chat_uuid, bot_id | user)
messages     (id, workspace_uuid, sender_type, sender_id, content,
              reply_to, tool_trace_json, created_at)
bot_dms      (from_bot_id, to_bot_id, workspace_uuid)
jobs         (id, bot_id, initiator_type, initiator_id, target_workspace_uuid,
              schedule, task, enabled, last_run_at, last_status)
memories     (bot_id, file_path, indexed_content, updated_at)
workspaces   (uuid, kind: bot|chat, path)
assets       (workspace_uuid, path, uploaded_by, created_at)
```

---

## 6. Build Order

1. **M1 — Foundation:** Docker Compose skeleton, Bun server, SQLite schema, SolidJS + TanStack Start shell, theme config
2. **M2 — Hosts & Bots:** host CRUD, bot CRUD with identity picker, provider adapters via TanStack AI
3. **M3 — Chat:** 1:1 user-bot chat, streaming, then group chat with @mentions and reply-depth rules
4. **M4 — Bot memory:** memory files, read/append tools, memory viewer UI
5. **M5 — Workspaces:** UUID workspace folders, shared assets per chat
6. **M6 — Bot-to-bot:** DMs, message bus, observation/mute controls
7. **M7 — Cron:** job scheduler, chat-initiated jobs, initiator + target tracking
8. **M8 — Browser:** Playwright sessions per workspace, activity logging, checkpoints
9. **M9 — Budgets, /goal, /aside, export**

---

## 7. Out of Scope (for v1)

- Image generation (bots may call an external API skill later)
- Voice / real-time audio
- Multi-node orchestration (single-node only; hosts are remote endpoints)
- Public bot sharing/marketplace (bot export as JSON is a cheap later add)
- Mobile app (mobile-first responsive web is enough)

---

## 8. Resolved Decisions

- **Auth:** Lightweight multi-user with login from day one. Email + password (or passkey) sessions; bots and chats are per-user scoped.
- **Providers:** Adapter-based, extensible. Z.AI is the first target provider; add OpenAI/Anthropic/Google/OpenRouter/Ollama as the build progresses.
- **Memory retrieval:** Full-file injection. Each bot's entire memory file is injected into context (watch token budgets; revisit chunked/embedding retrieval only if files outgrow context).
- **Bot DM workspaces:** Each bot keeps its own workspace UUID — bots are separate "people." DM threads are just message traffic between two bot workspaces; no third workspace is created.
- **Streaming:** Stream + durable everywhere (SSE/WebSocket for live delivery, persisted outbox so no message is lost on reconnect or crash). TanStack AI primitives handle the client contract.

**Database choice for durable streaming — recommendation: Postgres.** SQLite (WAL) can support the outbox pattern, but durable streaming across multi-user auth, bot DMs, and cron fan-out leans on features Postgres gives for free: `LISTEN/NOTIFY` for live fan-out, real transactional outbox, better write concurrency when multiple bots and jobs persist messages simultaneously, and mature queue extensions. With Drizzle ORM the schema is portable, but migrating SQLite→Postgres mid-build is real friction; paying the small ops cost of one Postgres container in the existing Docker Compose is the cheaper path. Switching the PRD stack: Bun + Drizzle + Postgres, everything else unchanged. (Flagging honestly: this is a judgment call based on standard patterns, not a benchmark — SQLite would likely still work fine at single-user-per-instance scale.)
