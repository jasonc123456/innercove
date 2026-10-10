/**
 * Memories: distilled, reusable facts about the user.
 *
 * Revised per §3c/D38 (supersedes this package's first draft):
 *   - Add `origin: "user" | "ai_proposal"`.
 *   - "User-written memories are approved on create (D38); review is
 *     only for `ai_proposal` items." A memory's `status` is therefore
 *     DERIVED from `origin` at create time, never a client-chosen
 *     value for either origin (`MemoryCreateInputSchema` has no
 *     `status` field at all).
 *   - **Drop `saved` and `useEnabled` entirely.** The first draft's
 *     independent saved/use-enabled booleans do not exist in the
 *     product: "the per-chat 'use this memory' choice lives in the
 *     chat request (`pinnedMemoryIds`)" -- that is A's `/api/chat`
 *     request shape, not a field on the memory record. A memory that
 *     exists and is `approved` is implicitly "saved"; whether a given
 *     chat turn actually uses it is a per-request choice, not
 *     per-memory persisted state.
 *   - Provenance is no longer embedded as `provenanceLinkIds` on the
 *     record -- it is a separate, generically-queryable table (see
 *     provenance.ts); `MemoryCreateInputSchema` instead takes `sources`
 *     directly (the provenance rows are created alongside the memory,
 *     pointing `derivedType: "memory"` back at it).
 */
import { z } from "zod";
import { UserIdSchema, MemoryIdSchema } from "./ids.js";
import { AccessLevelSchema } from "./access.js";
import { ProvenanceSourceRefSchema } from "./provenance.js";

export const MemoryOriginSchema = z.enum(["user", "ai_proposal"]);
export type MemoryOrigin = z.infer<typeof MemoryOriginSchema>;

export const MemoryStatusSchema = z.enum(["proposed", "approved", "rejected"]);
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

export const MemoryRecordSchema = z.object({
  id: MemoryIdSchema,
  userId: UserIdSchema,
  origin: MemoryOriginSchema,
  status: MemoryStatusSchema,
  content: z.string().min(1),
  accessLevel: AccessLevelSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

/** Create input: conservative by construction -- `status` is NOT a
 * client-settable field at all; it is derived from `origin`
 * server-side: `origin: "user"` => `status: "approved"` immediately
 * (D38); `origin: "ai_proposal"` => `status: "proposed"`, awaiting
 * `POST /api/memories/:id/review`. `sources` (>=1) replaces the first
 * draft's `provenanceLinkIds` -- see provenance.ts. `.strict()`. */
export const MemoryCreateInputSchema = z
  .object({
    origin: MemoryOriginSchema,
    content: z.string().min(1),
    accessLevel: AccessLevelSchema,
    sources: z.array(ProvenanceSourceRefSchema).min(1),
  })
  .strict();
export type MemoryCreateInput = z.infer<typeof MemoryCreateInputSchema>;

/** General content/metadata update -- deliberately EXCLUDES `status`
 * and `origin` (neither is ever touched by an ordinary field edit;
 * `origin` never changes after create, and `status` only changes via
 * the dedicated review action below). `.strict()`. */
export const MemoryUpdateInputSchema = z
  .object({
    content: z.string().min(1).optional(),
    accessLevel: AccessLevelSchema.optional(),
  })
  .strict();
export type MemoryUpdateInput = z.infer<typeof MemoryUpdateInputSchema>;

/** The one, explicit way `status` changes after create. Per D38, this
 * action is only ever meaningful for an `origin: "ai_proposal"` memory
 * (a `"user"`-origin memory is already `"approved"` the moment it's
 * created) -- that is a HANDLER-level precondition this schema cannot
 * express on its own (it has no access to the existing record's
 * `origin` at parse time), so the handler must reject a review call
 * against a `"user"`-origin memory itself (e.g. `CONFLICT`). `.strict()`
 * via each branch. */
export const MemoryReviewActionInputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved") }).strict(),
  z.object({ status: z.literal("rejected") }).strict(),
]);
export type MemoryReviewActionInput = z.infer<typeof MemoryReviewActionInputSchema>;

/** The shape A reads memory candidates in as -- see
 * data-layer/index.ts's DiaryMemoryReadPort for the eligibility
 * contract (approved + ai_eligible + not deleted + no revoked source)
 * this type is returned under; A never sees a `proposed`/`rejected`
 * memory through that port at all. */
export type MemoryCandidate = MemoryRecord;
