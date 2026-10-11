import { and, desc, eq, sql } from "drizzle-orm";
import {
  DiaryEntryCreateInputSchema, DiaryEntryRecordSchema, DiaryEntryUpdateInputSchema,
  type DiaryEntryCreateInput, type DiaryEntryUpdateInput, type UserId,
} from "@innercove/core";
import { DatabaseError, type DatabaseLease } from "../db.js";
import { diaryEntries, messages, provenance, settings } from "../schema.js";
import { olderThan, owner, page, requireRow, timestamp, tombstone, uuidv7 } from "./common.js";

export class DiaryRepository {
  constructor(readonly lease: DatabaseLease) {}
  get(userId: UserId, id: string) {
    return DiaryEntryRecordSchema.parse(requireRow(this.lease.orm.select().from(diaryEntries).where(owner(diaryEntries, userId, id)).get()));
  }
  list(userId: UserId, limit: number, cursor?: string, q?: string) {
    const anchor = cursor ? this.get(userId, cursor) : undefined;
    try {
      const result = page(this.lease.orm.select().from(diaryEntries).where(and(
        eq(diaryEntries.userId, userId), anchor ? olderThan(diaryEntries, anchor) : undefined,
        q ? sql`${diaryEntries.id} IN (SELECT d.id FROM diary_fts JOIN diary_entries d ON d.rowid=diary_fts.rowid WHERE diary_fts MATCH ${q} AND d.user_id=${userId})` : undefined,
      )).orderBy(desc(diaryEntries.updatedAt), desc(diaryEntries.id)).limit(limit + 1).all().map(r => DiaryEntryRecordSchema.parse(r)), limit);
      return { entries: result.rows, nextCursor: result.nextCursor };
    } catch (error) {
      // Malformed MATCH syntax is client input, never echo SQL or diary text.
      if (q && /fts5|syntax error|unterminated string|no such column/i.test(String(((error as { cause?: Error }).cause ?? error as Error).message))) {
        throw new DatabaseError("VALIDATION_ERROR", "Invalid search query");
      }
      throw error;
    }
  }
  create(userId: UserId, input: DiaryEntryCreateInput) {
    const { sources, ...data } = DiaryEntryCreateInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      // Validate all polymorphic source ownership before writing anything.
      for (const source of sources ?? []) {
        if (source.sourceType === "message") requireRow(this.lease.orm.select({ id: messages.id }).from(messages).where(owner(messages, userId, source.sourceId)).get());
        if (source.sourceType === "diary_entry") this.get(userId, source.sourceId);
      }
      const defaults = requireRow(this.lease.orm.select().from(settings).where(eq(settings.userId, userId)).get());
      const now = timestamp();
      const record = DiaryEntryRecordSchema.parse({ ...data, id: uuidv7(), userId, title: data.title ?? null,
        accessLevel: data.accessLevel ?? defaults.diaryDefaultAccessLevel, tags: data.tags ?? [], mood: data.mood ?? null, createdAt: now, updatedAt: now });
      this.lease.orm.insert(diaryEntries).values(record).run();
      for (const source of sources ?? []) this.lease.orm.insert(provenance).values({ userId, derivedType: "diary_entry", derivedId: record.id, ...source }).onConflictDoNothing().run();
      return record;
    })();
  }
  update(userId: UserId, id: string, input: DiaryEntryUpdateInput) {
    const data = DiaryEntryUpdateInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      const old = this.get(userId, id);
      if (Object.keys(data).length) this.lease.orm.update(diaryEntries).set({ ...data, updatedAt: timestamp() }).where(owner(diaryEntries, userId, id)).run();
      if (old.accessLevel === "ai_eligible" && data.accessLevel === "private") tombstone(this.lease, userId, "diary_entry", id, "access_revoked");
      return this.get(userId, id);
    })();
  }
  delete(userId: UserId, id: string) {
    return this.lease.db.transaction(() => {
      this.get(userId, id);
      this.lease.orm.delete(diaryEntries).where(owner(diaryEntries, userId, id)).run();
      // Existing FTS triggers remove the indexed content; secure-delete is
      // verified by DatabaseStore's migration gate. Source IDs stay content-free.
      return { tombstone: tombstone(this.lease, userId, "diary_entry", id) };
    })();
  }
}
