import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

/** The standard Drizzle journal/hash table is the only migration ledger.
 * Its SQLite migrator applies pending migrations in one transaction. */
export function migrateDatabase(db: Database.Database) {
  const orm = drizzle(db, { schema });
  const config = { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) };
  const files = readMigrationFiles(config);
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get()) {
    const applied = db.prepare("SELECT hash,created_at FROM __drizzle_migrations").all() as { hash: string; created_at: number }[];
    for (const version of applied) {
      if (!files.some((file) => file.folderMillis === version.created_at && file.hash === version.hash)) {
        throw new Error("Unsupported or modified database migration");
      }
    }
  }
  migrate(orm, config);
  // Fail closed if the runtime lacks FTS secure-delete (not the ordinary
  // SQLite secure_delete pragma). Both are required by this foundation.
  for (const table of ["diary_fts", "memory_fts"]) {
    const row = db.prepare(`SELECT v FROM ${table}_config WHERE k='secure-delete'`).get() as { v: number } | undefined;
    if (row?.v !== 1) throw new Error("FTS secure-delete unavailable");
  }
  return orm;
}
