/**
 * The minimal data-layer ports role A needs. Plain TypeScript
 * interfaces (contracts for whatever persistence implementation B
 * builds), not Zod schemas -- A calls these and receives already-
 * validated, already-FILTERED record types; A never constructs or
 * validates a persisted-record shape itself, and never talks to a
 * database directly.
 *
 * Explicitly OUT of scope here (A owns these, not B): retrieval
 * ranking, prompt assembly, chat/SSE contracts, and the history-
 * exclusion POLICY (A decides what; this file's job is only to let A
 * find out that something WAS revoked/deleted, and to hand it an
 * already-eligible candidate pool to rank over).
 */
import type { UserId, DiaryEntryId, MemoryId, MessageId, ConversationId } from "../types/ids.js";
import type { ConversationCreateInput, ConversationRecord, MessageCreateInput, MessageRecord } from "../types/conversation.js";
import type { DiaryEntryCandidate } from "../types/diary.js";
import type { MemoryCandidate } from "../types/memory.js";
import type { ProvenanceLinkRecord } from "../types/provenance.js";
import type { MessageContextCreateInput, MessageContextRecord, MessageContextSourceRef } from "../types/message-context.js";
import type { TombstoneRecord } from "../types/tombstone.js";

// -------------------------------------------------- 1. persisting saved chat --
export interface ConversationPersistencePort {
  saveConversation(input: ConversationCreateInput & { userId: UserId }): Promise<ConversationRecord>;
  /** Throws a NOT_FOUND-shaped error (api/errors.ts's ApiErrorCode) if
   * the target conversation does not exist or belongs to a different
   * user. There is no "temporary conversation" case to guard against
   * here at all (§3c/D35): a temporary chat never calls this port in
   * the first place -- it goes through A's stateless `/api/infer`
   * exclusively. */
  appendMessage(input: MessageCreateInput & { userId: UserId }): Promise<MessageRecord>;
  /** Records which eligible sources (diary entries / memories) were
   * actually sent as context for a saved message -- the write side of
   * `messageContext` (§3c, required for the chips/"sent" panel/D33).
   * Called once per source immediately after `appendMessage` succeeds
   * for the assistant's reply, with EXACTLY the sources A's retrieval
   * step decided to inject (never more, never re-derived later). */
  recordMessageContext(input: MessageContextCreateInput & { userId: UserId }): Promise<MessageContextRecord>;
  /** Atomic production write for a completed reply and its context IDs.
   * Optional for older test adapters; no public HTTP payload changes. */
  appendMessageWithContext?(input: MessageCreateInput & { userId: UserId }, sources: MessageContextSourceRef[]): Promise<MessageRecord>;
}

// --------------------------------- 2. reading user-scoped candidates for A --
export interface PageParams {
  userId: UserId;
  limit: number;
  /** Opaque pagination cursor -- the last id seen in a prior page, not
   * an offset. */
  cursor?: DiaryEntryId | MemoryId;
}

/** A memory candidate bundled with its resolved provenance (not just a
 * list of ids, since provenance rows carry no id of their own -- see
 * provenance.ts) -- A needs the actual source references to decide/
 * explain what a retrieved memory is grounded in, without a second
 * round trip per memory. */
export interface MemoryCandidateWithProvenance extends MemoryCandidate {
  provenance: ProvenanceLinkRecord[];
}

/**
 * ELIGIBILITY CONTRACT (§3c, verbatim, binding on every real
 * implementation of this interface -- not a suggestion):
 *   "B's read port returns only eligible items: scoped to the user;
 *   `accessLevel: ai_eligible`; approved, for memories; not deleted;
 *   no private, deleted or revoked source (D16). An unresolved source
 *   counts as private. A only ranks and selects."
 *
 * Concretely, for EVERY row either method below returns:
 *   - `userId` matches the caller's `params.userId` -- no cross-user
 *     leakage, ever.
 *   - `accessLevel === "ai_eligible"` (never `"private"`).
 *   - for `listMemoryCandidates`: `status === "approved"` (never
 *     `"proposed"`/`"rejected"` -- A never sees an ai_proposal memory
 *     awaiting review through this port at all).
 *   - the row itself is not (soft-)deleted.
 *   - EVERY source in the row's own provenance is itself not private,
 *     not deleted, and not revoked (D16: "revoking a source excludes
 *     everything derived from it"). A source this implementation
 *     cannot resolve at all (missing row, broken reference) counts as
 *     private -- fail closed, never fail open by treating "unknown"
 *     as "fine".
 *
 * There is NO parameter on either method to ask for anything outside
 * this contract (no "includeIneligible" flag, no raw SQL escape) --
 * if a caller needs an ineligible row for its own (e.g. UI "why can't
 * the AI see this") purposes, that is a DIFFERENT, B-owned route
 * (`GET /api/diary/:id`, `GET /api/memories/:id`), never this port.
 */
export interface DiaryMemoryReadPort {
  listDiaryCandidates(params: PageParams): Promise<DiaryEntryCandidate[]>;
  listMemoryCandidates(params: PageParams): Promise<MemoryCandidateWithProvenance[]>;
}

/** Read side of `messageContext` -- lets A check, for a batch of
 * already-saved messages, which sources their replies actually used,
 * so A's OWN history-exclusion policy (D33) can decide whether any of
 * them have since become ineligible (by re-checking those source ids
 * against `DiaryMemoryReadPort`'s eligibility contract above). This
 * port does not itself decide eligibility or exclude anything -- "A
 * only ranks and selects" extends to this decision too. */
export interface MessageContextReadPort {
  listContextForMessages(params: { userId: UserId; messageIds: MessageId[] }): Promise<MessageContextRecord[]>;
}

// ------------------------------------- 3. revocation/deletion reporting for A --
export interface RevocationReportingPort {
  /** Every tombstone for `userId` created at or after `since` (ISO
   * datetime) -- A diffs this against whatever it has already used as
   * context and excludes any matching id. `since` is a cursor A owns
   * and advances itself; this port does not track per-caller read
   * state. Tombstones carry no content (tombstone.ts) -- this is safe
   * to poll frequently without itself becoming a content-leak channel. */
  listTombstonesSince(params: { userId: UserId; since: string }): Promise<TombstoneRecord[]>;
}

/** Saved messages in chronological order, scoped to the user. A applies
 * D33 history exclusion before choosing its bounded prompt history. */
export interface ConversationHistoryPort {
  listMessages(params: { userId: UserId; conversationId: ConversationId }): Promise<MessageRecord[]>;
}
