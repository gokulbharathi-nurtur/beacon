import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';
import { backfillProjects } from './backfill';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, 'datalayer-qa.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

declare global {
  var __datalayerQaSqlite: Database.Database | undefined;
  var __datalayerQaMigrated: boolean | undefined;
}

// Reused across Next.js dev-server hot reloads so we don't open a new file handle per reload.
const sqlite = globalThis.__datalayerQaSqlite ?? new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
if (process.env.NODE_ENV !== 'production') {
  globalThis.__datalayerQaSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };

if (!globalThis.__datalayerQaMigrated) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });
  backfillProjects(sqlite);
  globalThis.__datalayerQaMigrated = true;
}
