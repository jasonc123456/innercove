import { and, desc, eq } from "drizzle-orm";
import {
  MemoryCreateInputSchema, MemoryRecordSchema, MemoryUpdateInputSchema, MemoryReviewActionInputSchema,
  type MemoryCreateInput, type MemoryUpdateInput, type MemoryReviewActionInput, type ListMemoriesQuery, type UserId,
} from "@innercove/core";
import { DatabaseError, type DatabaseLease } from "../db.js";
import { diaryEntries, memories, messages, provenance } from "../schema.js";
import { invalidateDependents, PermissionPolicy } from "../permissions.js";
import { olderThan, owner, page, requireRow, timestamp, tombstone, uuidv7 } from "./common.js";

export class MemoryRepository {
  constructor(readonly lease: DatabaseLease) {}
  get(userId: UserId, id: string) {
    return MemoryRecordSchema.parse(requireRow(this.lease.orm.select().from(memories).where(owner(memories, userId, id)).get()));
  }
  list(userId: UserId, query: ListMemoriesQuery) {
    const anchor = query.cursor ? this.get(userId, query.cursor) : undefined;
    const result = page(this.lease.orm.select().from(memories).where(and(eq(memories.userId, userId),
      query.status ? eq(memories.status, query.status) : undefined,
      query.origin ? eq(memories.origin, query.origin) : undefined,
      anchor ? olderThan(memories, anchor) : undefined,
    )).orderBy(desc(memories.updatedAt), desc(memories.id)).limit(query.limit + 1).all().map(row => MemoryRecordSchema.parse(row)), query.limit);
    return { memories: result.rows, nextCursor: result.nextCursor };
  }
  create(userId: UserId, input: MemoryCreateInput) {
    const { sources, ...data } = MemoryCreateInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      for (const source of sources) {
        if (source.sourceType === "manual") continue;
        const table = source.sourceType === "message" ? messages : diaryEntries;
        requireRow(this.lease.orm.select({ id: table.id }).from(table).where(owner(table, userId, source.sourceId)).get());
      }
      const policy = new PermissionPolicy(this.lease, userId);
      const now = timestamp();
      const record = MemoryRecordSchema.parse({ ...data, id: uuidv7(), userId,
        accessLevel: data.accessLevel === "ai_eligible" && policy.sourcesEligible(sources) ? "ai_eligible" : "private",
        status: data.origin === "user" ? "approved" : "proposed", createdAt: now, updatedAt: now });
      this.lease.orm.insert(memories).values(record).run();
      for (const source of sources) this.lease.orm.insert(provenance).values({ userId, derivedType: "memory", derivedId: record.id, ...source }).onConflictDoNothing().run();
      return record;
    })();
  }
  update(userId: UserId, id: string, input: MemoryUpdateInput) {
    const data = MemoryUpdateInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      const old = this.get(userId, id);
      if (data.accessLevel === "ai_eligible") new PermissionPolicy(this.lease, userId).assertGrant("memory", id);
      if (Object.keys(data).length) this.lease.orm.update(memories).set({ ...data, updatedAt: timestamp() }).where(owner(memories, userId, id)).run();
      if (old.accessLevel === "ai_eligible" && data.accessLevel === "private") {
        invalidateDependents(this.lease, userId, "memory", id);
        tombstone(this.lease, userId, "memory", id, "access_revoked");
      }
      return this.get(userId, id);
    })();
  }
  review(userId: UserId, id: string, input: MemoryReviewActionInput) {
    const data = MemoryReviewActionInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      const old = this.get(userId, id);
      if (old.origin !== "ai_proposal") throw new DatabaseError("CONFLICT", "Only AI-proposed memories can be reviewed");
      if (data.status === "approved" && old.accessLevel === "ai_eligible") new PermissionPolicy(this.lease, userId).assertGrant("memory", id);
      this.lease.orm.update(memories).set({ status: data.status, updatedAt: timestamp() }).where(owner(memories, userId, id)).run();
      if (old.status === "approved" && data.status === "rejected") {
        invalidateDependents(this.lease, userId, "memory", id);
        tombstone(this.lease, userId, "memory", id, "access_revoked");
      }
      return this.get(userId, id);
    })();
  }
  delete(userId: UserId, id: string) {
    return this.lease.db.transaction(() => {
      this.get(userId, id);
      invalidateDependents(this.lease, userId, "memory", id);
      this.lease.orm.delete(memories).where(owner(memories, userId, id)).run();
      return { tombstone: tombstone(this.lease, userId, "memory", id) };
    })();
  }
}
