/**
 * `messageContext`: which sources (diary entries / memories) were
 * actually injected as context for a given saved message. §3c: "{
 * userId, messageId, sourceType, sourceId }. **Required:** the chips,
 * the 'sent' panel and D33 depend on it." This did not exist in this
 * package's first draft -- it is net new.
 *
 * No `id` column (same reasoning as provenance.ts): a link row is
 * addressed by its natural key (`messageId` + `sourceType` + `sourceId`),
 * one row per source a message actually used.
 *
 * `sourceType` is NOT "manual" here -- unlike provenance (where a
 * memory can have a manually-typed, source-less origin), a message's
 * context block only ever names a real diary entry or memory that was
 * actually retrieved and sent; there is no "manual context" concept.
 */
import { z } from "zod";
import { UserIdSchema, MessageIdSchema, DiaryEntryIdSchema, MemoryIdSchema } from "./ids.js";

export const MessageContextSourceRefSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("diary_entry"), sourceId: DiaryEntryIdSchema }).strict(),
  z.object({ sourceType: z.literal("memory"), sourceId: MemoryIdSchema }).strict(),
]);
export type MessageContextSourceRef = z.infer<typeof MessageContextSourceRefSchema>;

// `.strict()` on the plain object operand is REQUIRED, not cosmetic:
// in zod 4.6.5, `z.intersection` of a non-strict object with an
// otherwise-strict schema silently stops enforcing strictness for the
// whole composite (verified by direct repro -- see provenance.ts's
// matching comment for the exact failing/passing cases).
export const MessageContextRecordSchema = z.intersection(
  z.object({ userId: UserIdSchema, messageId: MessageIdSchema }).strict(),
  MessageContextSourceRefSchema,
);
export type MessageContextRecord = z.infer<typeof MessageContextRecordSchema>;

/** Create input: `userId` is server-assigned; `messageId` comes from
 * whichever message the server just persisted (A's pipeline supplies
 * it, never a client over HTTP -- there is no public endpoint that
 * creates these directly, see data-layer/index.ts's
 * MessageContextWritePort). */
export const MessageContextCreateInputSchema = z.intersection(
  z.object({ messageId: MessageIdSchema }).strict(),
  MessageContextSourceRefSchema,
);
export type MessageContextCreateInput = z.infer<typeof MessageContextCreateInputSchema>;
