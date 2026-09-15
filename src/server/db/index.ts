import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Server-only. Imported exclusively from server function handlers, never
// from client components.
const databaseUrl = Bun.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set (see .env.example)')

const client = postgres(databaseUrl, { max: 5 })

export const db = drizzle(client, { schema })
