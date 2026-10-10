/**
 * All persisted-record IDs are UUIDv7 (plan decision: UUIDv7 IDs).
 * Each entity gets its own branded id schema so `DeviceId` and `UserId`
 * (both plain UUIDv7 strings at runtime) are NOT interchangeable at the
 * type level -- a handler that expects a `MemoryId` will not compile if
 * handed a `DiaryEntryId`, even though both pass the same runtime regex.
 *
 * Branding is a TypeScript-only construct (zod's `.brand()` performs no
 * extra runtime work); the runtime check is the shared UUIDv7 regex below.
 * This is shape validation, not permission enforcement -- see each
 * record's own comments for what is and is not provable by the schema.
 */
import { z } from "zod";

// version nibble fixed to "7"; variant nibble restricted to the RFC 4122
// 8/9/a/b range. Deliberately NOT using zod's generic `.uuid()` chain,
// which accepts any UUID version -- IDs that are syntactically a UUID but
// not a v7 one must fail validation, not silently pass.
const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// `.brand<Brand>()` is a type-only phantom tag -- it takes no runtime
// argument, so the brand name is only ever supplied as an explicit type
// parameter below, never as a value this function reads.
function uuidv7Schema<Brand extends string>() {
  return z.string().regex(UUIDV7_RE, "Expected a UUIDv7 id").brand<Brand>();
}

export const UserIdSchema = uuidv7Schema<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

export const ConversationIdSchema = uuidv7Schema<"ConversationId">();
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const MessageIdSchema = uuidv7Schema<"MessageId">();
export type MessageId = z.infer<typeof MessageIdSchema>;

export const DiaryEntryIdSchema = uuidv7Schema<"DiaryEntryId">();
export type DiaryEntryId = z.infer<typeof DiaryEntryIdSchema>;

export const MemoryIdSchema = uuidv7Schema<"MemoryId">();
export type MemoryId = z.infer<typeof MemoryIdSchema>;

// `provenance` and `messageContext` are link rows (§3c/§3: `provenance(user_id,
// derived_type, derived_id, source_type, source_id)`, `message_context(user_id,
// message_id, source_type, source_id)`) with no `id` column of their own --
// deliberately NO ProvenanceId/MessageContextId schema here. They are
// addressed by their natural key (whose derived/message id + source), never
// by a surrogate id. See provenance.ts / conversation.ts's MessageContext
// section and README.md's "where §3c was silent" note.

export const DeviceIdSchema = uuidv7Schema<"DeviceId">();
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const TombstoneIdSchema = uuidv7Schema<"TombstoneId">();
export type TombstoneId = z.infer<typeof TombstoneIdSchema>;
