import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'
import type { StreamChunk, UpsertableStreamDurability } from '@tanstack/ai'
import { db } from './db'
import { runEvents, runs } from './db/schema'

// Postgres-backed StreamDurability (PRD §8: stream + durable). Chunks land in
// run_events BEFORE delivery, so any reconnect — a dropped fetch, a page
// reload, a second device — replays exactly what was already sent without
// re-running the model. Run-id and offset semantics mirror the memoryStream
// reference backend so the TanStack AI client can never disagree with us:
// offsets are opaque `${runId}:${seq}` strings.

/** Milliseconds after which an open run with no appends is treated as closed
    by readers — the crashed-producer case, where close() never ran. */
const STALE_RUN_MS = 5 * 60 * 1000
const POLL_MS = 150

const offsetFor = (runId: string, seq: number) => `${runId}:${seq}`

function decodeOffset(offset: string, runId: string): number {
  const prefix = `${runId}:`
  if (!offset.startsWith(prefix)) {
    throw new Error(`Offset ${JSON.stringify(offset)} does not belong to run ${JSON.stringify(runId)}`)
  }
  const seq = Number(offset.slice(prefix.length))
  if (!Number.isFinite(seq)) {
    throw new Error(`Offset ${JSON.stringify(offset)} has no usable sequence number`)
  }
  return seq
}

export function pgStream(init: {
  runId: string
  /** Resume tail: null = fresh producer, '-1' = from the start, 'now' = tail
      from the live end, otherwise an offset previously returned by append. */
  offset?: string | null
}): UpsertableStreamDurability {
  const { runId } = init

  const tailAfter = async (offset: string): Promise<number> => {
    if (offset === '-1') return -1
    if (offset === 'now') {
      // Park at the current end: only rows appended after this call are read.
      const [last] = await db
        .select({ seq: runEvents.seq })
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(desc(runEvents.seq))
        .limit(1)
      return last ? Number(last.seq) : -1
    }
    return decodeOffset(offset, runId)
  }

  // Terminal when there is no run row, the producer closed the log, or the
  // run is open but clearly dead (crashed producer, close() never ran).
  const isTerminal = async (): Promise<boolean> => {
    const [run] = await db
      .select({ open: runs.open, updatedAt: runs.updatedAt })
      .from(runs)
      .where(eq(runs.id, runId))
    if (!run) return true
    if (!run.open) return true
    return Date.now() - run.updatedAt.getTime() > STALE_RUN_MS
  }

  return {
    resumeFrom: () => init.offset ?? null,

    append: async (chunks) => {
      if (chunks.length === 0) return []
      const inserted = await db
        .insert(runEvents)
        .values(chunks.map((chunk) => ({ runId, chunk })))
        .returning({ seq: runEvents.seq })
      await db.update(runs).set({ updatedAt: new Date() }).where(eq(runs.id, runId))
      return inserted.map((r) => offsetFor(runId, Number(r.seq)))
    },

    upsert: async (entries) => {
      // Crash-resume path: re-persist an overlapping range idempotently.
      // Validate the whole batch (dense, no repeats, owned offsets, no holes)
      // before touching stored state, per the UpsertableStreamDurability spec.
      const rows = await db
        .select({ seq: runEvents.seq })
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(asc(runEvents.seq))
      let tail = rows.length > 0 ? Number(rows[rows.length - 1].seq) : -1
      const seen = new Set<string>()
      const planned = entries.map((entry, index) => {
        if (!entry) throw new Error(`pgStream: entries[${index}] is missing; entries must be dense`)
        const seq = decodeOffset(entry.offset, runId)
        if (seen.has(entry.offset)) {
          throw new Error(`pgStream: entries[${index}].offset is repeated within the batch`)
        }
        seen.add(entry.offset)
        const exists = rows.some((r) => Number(r.seq) === seq)
        if (!exists && seq <= tail) {
          throw new Error(`pgStream: entries[${index}].offset claims position ${seq}, at or before the tail ${tail}`)
        }
        tail = Math.max(tail, seq)
        return { runId, seq, chunk: entry.chunk }
      })
      if (planned.length === 0) return []
      await db
        .insert(runEvents)
        .values(planned)
        .onConflictDoUpdate({
          target: [runEvents.runId, runEvents.seq],
          set: { chunk: sql`excluded.chunk` },
        })
      await db.update(runs).set({ updatedAt: new Date() }).where(eq(runs.id, runId))
      return entries.map((e) => e.offset)
    },

    read: async function* (offset, signal) {
      let tail = await tailAfter(offset)
      for (;;) {
        const rows = await db
          .select()
          .from(runEvents)
          .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, tail)))
          .orderBy(asc(runEvents.seq))
        for (const row of rows) {
          tail = Number(row.seq)
          yield { offset: offsetFor(runId, Number(row.seq)), chunk: row.chunk as StreamChunk }
        }
        if (signal?.aborted) return
        if (rows.length === 0 && (await isTerminal())) return
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      }
    },

    close: async () => {
      await db.update(runs).set({ open: false, updatedAt: new Date() }).where(eq(runs.id, runId))
    },

    snapshot: async () => {
      const rows = await db
        .select()
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(asc(runEvents.seq))
      return rows.map((r) => ({ offset: offsetFor(runId, Number(r.seq)), chunk: r.chunk as StreamChunk }))
    },
  }
}
