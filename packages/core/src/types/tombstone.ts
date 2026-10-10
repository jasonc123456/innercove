/**
 * Content-free tombstones (plan decision, explicitly confirmed as-is
 * by §3c: "`tombstones`: B's separate content-free table is fine.
 * Deleting still removes the content itself."): deleting a
 * conversation, message, diary entry or memory leaves behind a row
 * that proves WHAT was removed and WHEN, with NO content field of any
 * kind -- this is what lets role A's data-layer port report "exclude
 * this id from context" without that reporting channel itself
 * becoming a second place sensitive content could leak through.
 *
 * `provenance_link` was REMOVED from the entity list in this revision:
 * provenance/messageContext rows never had content to begin with (see
 * provenance.ts/message-context.ts) and have no `id` of their own to
 * tombstone -- they are simply hard-deleted alongside whichever
 * conversation/diary entry/memory they pointed at, which is already
 * what that parent's own tombstone records.
 */
import { z } from "zod";
import {
  UserIdSchema,
  TombstoneIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  DiaryEntryIdSchema,
  MemoryIdSchema,
} from "./ids.js";

export const TombstoneReasonSchema = z.enum(["user_deleted", "access_revoked", "expired"]);
export type TombstoneReason = z.infer<typeof TombstoneReasonSchema>;

export const TombstoneEntityRefSchema = z.discriminatedUnion("entityType", [
  z.object({ entityType: z.literal("conversation"), entityId: ConversationIdSchema }).strict(),
  z.object({ entityType: z.literal("message"), entityId: MessageIdSchema }).strict(),
  z.object({ entityType: z.literal("diary_entry"), entityId: DiaryEntryIdSchema }).strict(),
  z.object({ entityType: z.literal("memory"), entityId: MemoryIdSchema }).strict(),
]);
export type TombstoneEntityRef = z.infer<typeof TombstoneEntityRefSchema>;

// `.strict()` is REQUIRED here, not cosmetic: in zod 4.6.5,
// `z.intersection` of a non-strict object with an otherwise-strict
// schema silently stops enforcing strictness for the whole composite
// (verified by direct repro -- see provenance.ts's matching comment).
const TombstoneBaseSchema = z
  .object({
    id: TombstoneIdSchema,
    userId: UserIdSchema,
    reason: TombstoneReasonSchema,
    deletedAt: z.string().datetime(),
  })
  .strict();

export const TombstoneRecordSchema = z.intersection(TombstoneBaseSchema, TombstoneEntityRefSchema);
export type TombstoneRecord = z.infer<typeof TombstoneRecordSchema>;

/** The explicit, closed key set a TombstoneRecord is allowed to carry --
 * used by the boundary test in validate/run.ts to assert no content-like
 * key ("content", "text", "title", "body", ...) can ever sneak in via a
 * future edit to this file without that test failing first. */
export const TOMBSTONE_ALLOWED_KEYS = ["id", "userId", "entityType", "entityId", "reason", "deletedAt"] as const;
