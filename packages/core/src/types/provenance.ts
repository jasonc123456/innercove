/**
 * Explicit provenance (plan decision), generalized per §3c's data model
 * ("provenance: generic `{ userId, derivedType, derivedId, sourceType:
 * message | diary_entry | manual, sourceId | null }`") -- revised from
 * this package's first draft, which only ever pointed at a memory.
 * Provenance now covers BOTH derived kinds the plan names: a `memory`
 * distilled from a message/diary entry, and a diary entry itself saved
 * with `origin: "excerpt"` from a message. A link row has NO id of its
 * own (see ids.ts) -- it is addressed by its natural key, matching the
 * `provenance(user_id, derived_type, derived_id, source_type, source_id)`
 * column list exactly (no separate id column).
 */
import { z } from "zod";
import { UserIdSchema, MessageIdSchema, DiaryEntryIdSchema, MemoryIdSchema } from "./ids.js";

export const DerivedTypeSchema = z.enum(["memory", "diary_entry"]);
export type DerivedType = z.infer<typeof DerivedTypeSchema>;

export const ProvenanceSourceTypeSchema = z.enum(["message", "diary_entry", "manual"]);
export type ProvenanceSourceType = z.infer<typeof ProvenanceSourceTypeSchema>;

/** A provenance link's source reference is a discriminated union keyed
 * on sourceType, so a "message" link is required to carry a MessageId
 * and CANNOT carry a DiaryEntryId by accident. `"manual"` (renamed from
 * this package's first draft's `"manual_entry"` to match §3c's own
 * spelling exactly) still requires an explicit `sourceId: null` marker
 * -- "no source" is never represented by omitting the field. */
export const ProvenanceSourceRefSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("message"), sourceId: MessageIdSchema }).strict(),
  z.object({ sourceType: z.literal("diary_entry"), sourceId: DiaryEntryIdSchema }).strict(),
  z.object({ sourceType: z.literal("manual"), sourceId: z.null() }).strict(),
]);
export type ProvenanceSourceRef = z.infer<typeof ProvenanceSourceRefSchema>;

/** A derived-item reference, likewise discriminated so a "memory" link
 * can't carry a DiaryEntryId and vice versa. Each branch is `.strict()`
 * so an intersection of this with ProvenanceSourceRefSchema rejects an
 * unknown field instead of the default `.strip()` silently dropping it
 * -- an intersection only rejects what at least one of its two sides
 * itself rejects. */
export const DerivedRefSchema = z.discriminatedUnion("derivedType", [
  z.object({ derivedType: z.literal("memory"), derivedId: MemoryIdSchema }).strict(),
  z.object({ derivedType: z.literal("diary_entry"), derivedId: DiaryEntryIdSchema }).strict(),
]);
export type DerivedRef = z.infer<typeof DerivedRefSchema>;

/** Persisted record: `userId` is server-assigned (never client-supplied
 * -- see ProvenanceLinkCreateInputSchema). No `id`/`createdAt` here on
 * purpose: §3c's own column list for `provenance` has neither; a link
 * row's only timestamp of record is its derived item's `createdAt`. */
export const ProvenanceLinkRecordSchema = z.intersection(
  z.object({ userId: UserIdSchema }),
  z.intersection(DerivedRefSchema, ProvenanceSourceRefSchema),
);
export type ProvenanceLinkRecord = z.infer<typeof ProvenanceLinkRecordSchema>;

/** Create input: caller supplies which derived item and which source;
 * `userId` is always server-assigned. Strict via both branch schemas
 * (§3c convention: API inputs reject an unknown field, e.g. a
 * client-guessed `id`, outright rather than silently dropping it). */
export const ProvenanceLinkCreateInputSchema = z.intersection(
  DerivedRefSchema,
  ProvenanceSourceRefSchema,
);
export type ProvenanceLinkCreateInput = z.infer<typeof ProvenanceLinkCreateInputSchema>;
