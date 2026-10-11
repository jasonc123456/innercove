import { count, eq } from "drizzle-orm";
import type { DatabaseLease } from "./db.js";
import { conversations, diaryEntries, memories, messages, messageContext, provenance, tombstones, checkInEvents, dailyCheckIns, treeProgress } from "./schema.js";

/** Only DatabaseStore's exclusive lifecycle operation may call this: no
 * admitted requests/streams may still hold a connection or stale prompt.
 * D39 preserves identity, credentials, settings, devices and migrations. */
export function deleteUserContent(connection: Pick<DatabaseLease, "db" | "orm" | "userId">) {
  const { db, orm, userId } = connection;
  const deleted = db.transaction(() => {
    const totals = {
      conversations: orm.select({ n: count() }).from(conversations).where(eq(conversations.userId, userId)).get()!.n,
      diaryEntries: orm.select({ n: count() }).from(diaryEntries).where(eq(diaryEntries.userId, userId)).get()!.n,
      memories: orm.select({ n: count() }).from(memories).where(eq(memories.userId, userId)).get()!.n,
    };
    // Purge all links/tombstones, including retained IDs of deleted sources.
    // Use bulk deletion, not ordinary repos that would create tombstones.
    for (const table of [messageContext, provenance, messages, conversations, diaryEntries, memories, tombstones, checkInEvents, dailyCheckIns, treeProgress]) {
      orm.delete(table).where(eq(table.userId, userId)).run();
    }
    // Normal triggers remove this user's postings; optimize cleans segments
    // without deleting other users' FTS data or secure-delete configuration.
    db.exec("INSERT INTO diary_fts(diary_fts) VALUES('optimize'); INSERT INTO memory_fts(memory_fts) VALUES('optimize')");
    return totals;
  })();
  const checkpoint = () => {
    const rows = db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[];
    if (rows[0]?.busy !== 0) throw new Error("Database checkpoint unavailable");
  };
  checkpoint();
  db.exec("VACUUM"); // Must be outside the deletion transaction, still exclusive.
  checkpoint(); // VACUUM itself writes WAL pages; do not leave that journal.
  return { deleted };
}
