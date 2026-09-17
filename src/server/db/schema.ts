import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { BOT_COLORS, BOT_SHAPES } from '../../types/bot'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  // Opaque session token; stored as-is and compared on lookup.
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// A workspace is a named directory bots and threads operate on. It can live
// on the machine running the UI (endpoint omitted) or on any remote machine
// running Ground Control. §3.1
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  path: text('path'),
  // Address of the machine exposing this workspace; null = local machine.
  endpoint: text('endpoint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Threads (group chats) can access multiple workspaces. §3.1
// thread_id intentionally has no FK yet: until M3 gives threads their own
// table, a thread id is a bot-chat uuid or a group chat uuid.
export const threadWorkspaces = pgTable(
  'thread_workspaces',
  {
    threadId: uuid('thread_id').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.workspaceId] })],
)

// Bots are per-user (§8: per-user scoped) with the identity triple
// (emoji + muted pastel color + geometric shape) from §3.2.
export const bots = pgTable('bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  emoji: text('emoji').notNull().default('🤖'),
  // Color name from the curated muted palette; UI maps it to pastel classes.
  color: text('color', { enum: BOT_COLORS }).notNull().default('stone'),
  shape: text('shape', { enum: BOT_SHAPES }).notNull().default('circle'),
  avatarPath: text('avatar_path'),
  category: text('category'),
  soul: text('soul'),
  instructions: text('instructions'),
  modelId: text('model_id'),
  skills: text('skills').notNull().default('[]'),
  budget: text('budget').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groupChats = pgTable('group_chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Display label until chat members are wired in M3.
  membersLabel: text('members_label').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Group chat membership (§3.5). The owning user is implicit via
// group_chats.user_id; members are the bots that can be @mentioned.
export const chatMembers = pgTable(
  'chat_members',
  {
    chatId: uuid('chat_id')
      .notNull()
      .references(() => groupChats.id, { onDelete: 'cascade' }),
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.botId] })],
)

// Thread messages. thread_id is the bot's id for 1:1 threads or the group
// chat's id for group threads (same key space as thread_workspaces).
// sender_bot_id is set when the sender is a bot.
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull(),
    senderType: text('sender_type', { enum: ['user', 'bot'] }).notNull(),
    senderBotId: uuid('sender_bot_id').references(() => bots.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_thread_created_idx').on(t.threadId, t.createdAt)],
)

// Delivery-durability log for streaming runs (PRD §8: stream + durable).
// `runs` carries run lifecycle (open until the producer closes it); a stale
// `updated_at` on an open run is treated as closed by readers — that is the
// crashed-producer case. `run_events` stores each streamed chunk under a
// per-run sequence so a reconnect replays exactly what was delivered.
export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull(),
  open: boolean('open').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const compactionMetadata = pgTable('compaction_metadata', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull(),
  scope: text('scope').notNull(),
  namespace: text('namespace').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.threadId, t.scope, t.namespace, t.key] })])

export const runEvents = pgTable(
  'run_events',
  {
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    chunk: jsonb('chunk').notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq] })],
)
