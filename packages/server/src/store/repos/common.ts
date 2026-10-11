import { randomBytes } from "node:crypto";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { and, eq, sql } from "drizzle-orm";
import { type TombstoneRecord, type UserId } from "@innercove/core";
import type { DatabaseLease } from "../db.js";
import { NotFoundError } from "../../chat/ports.js";
import { tombstones } from "../schema.js";

export function uuidv7(): string {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6]! & 15) | 0x70;
  b[8] = (b[8]! & 63) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function requireRow<T>(row: T | undefined): T {
  if (!row) throw new NotFoundError("Item not found");
  return row;
}
export function tombstone(lease: DatabaseLease, userId: UserId, entityType: TombstoneRecord["entityType"], entityId: string, reason: TombstoneRecord["reason"] = "user_deleted"): TombstoneRecord {
  const record = { id: uuidv7(), userId, entityType, entityId, reason, deletedAt: new Date().toISOString() } as TombstoneRecord;
  lease.orm.insert(tombstones).values(record).run();
  return record;
}
export function owner(table: { userId: AnySQLiteColumn; id: AnySQLiteColumn }, userId: UserId, id: string) {
  return and(eq(table.userId, userId), eq(table.id, id));
}
export function page<T extends { id: string; updatedAt: string }>(rows: T[], limit: number) {
  return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export const timestamp = () => new Date().toISOString();
// Stable recency ordering includes an ID tie-breaker; a scoped cursor is
// resolved by each repository before constructing this predicate.
export const olderThan = (table: { updatedAt: AnySQLiteColumn; id: AnySQLiteColumn }, cursor: { updatedAt: string; id: string }) =>
  sql`(${table.updatedAt} < ${cursor.updatedAt} OR (${table.updatedAt} = ${cursor.updatedAt} AND ${table.id} < ${cursor.id}))`;
