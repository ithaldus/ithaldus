import { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/topograph.db'

// Ensure data directory exists
try {
  mkdirSync(dirname(dbPath), { recursive: true })
} catch {
  // Directory already exists
}

const db = new Database(dbPath)
db.exec('PRAGMA journal_mode = WAL')

// Create migrations table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`)

// Get already applied migrations
const applied = db.query('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]
const appliedHashes = new Set(applied.map(m => m.hash))

// Get migration files
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, 'migrations')
let files: string[] = []

try {
  files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
} catch {
  console.log('No migrations directory found')
  process.exit(0)
}

// Apply new migrations
for (const file of files) {
  const hash = file.replace('.sql', '')

  if (appliedHashes.has(hash)) {
    console.log(`Skipping ${file} (already applied)`)
    continue
  }

  console.log(`Applying ${file}...`)

  const sql = readFileSync(join(migrationsDir, file), 'utf-8')

  try {
    // Split by statement and execute each
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)

    for (const statement of statements) {
      db.exec(statement)
    }

    // Record migration
    db.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [hash, Date.now()])

    console.log(`Applied ${file}`)
  } catch (err) {
    console.error(`Failed to apply ${file}:`, err)
    process.exit(1)
  }
}

console.log('Migrations complete!')
db.close()
