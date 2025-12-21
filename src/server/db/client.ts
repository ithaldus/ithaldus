import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/topograph.db'

// Ensure data directory exists
try {
  mkdirSync(dirname(dbPath), { recursive: true })
} catch {
  // Directory already exists
}

const sqlite = new Database(dbPath)
sqlite.exec('PRAGMA journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
