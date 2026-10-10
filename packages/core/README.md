# @innercove/core

Shared Zod contracts: persisted records, create/update inputs, API
request/response shapes, and the minimal data-layer ports role A reads
from. Owned by role B. Revised to match `docs/PROJECT_PLAN.md` §3c
(2026-10-10) — **§3c wins where this package's first draft differed**
(see `docs/DECISIONS.md` D42).

## Where §3c was silent: chosen defaults

§3c and the earlier plan sections don't spell out every shape. Where
that happened, this package picked one consistent default rather than
leaving the gap open. None of these reopen a confirmed decision (D01–
D42); they fill in a shape §3c never specified at all.

- **No "create excerpt" endpoint exists in §3c's route table.** A diary
  excerpt (`origin: "excerpt"`) is created through the ordinary `POST
  /api/diary`, with a required `sources` array (>=1 `ProvenanceSourceRef`)
  on the create input when `origin === "excerpt"` — enforced by a
  `superRefine` in `types/diary.ts`. The handler turns `sources` into
  `provenance` rows (`derivedType: "diary_entry"`) after the insert.
- **Memory creation's `sources` field mirrors the same pattern**: since
  `provenance` rows have no id of their own and can't exist before the
  memory does, `MemoryCreateInputSchema` takes `sources` directly rather
  than a list of provenance ids; the handler creates the `provenance`
  rows (`derivedType: "memory"`) immediately after inserting the memory.
- **`provenance` and `messageContext` have no `id` column**, read
  literally off §3c's own column lists (`provenance(user_id,
  derived_type, derived_id, source_type, source_id)`, `message_context
  (user_id, message_id, source_type, source_id)` — neither lists an
  `id`). They're addressed by their natural key, never a surrogate id.
- **Tombstones no longer cover `provenance_link`.** A provenance/
  messageContext row never had content and is hard-deleted alongside
  whichever memory/diary entry/message it pointed at — that parent's
  own tombstone already records the deletion.
- **`diaryDefaultAccessLevel` is read by the HANDLER, not hardcoded by
  this package.** `DiaryEntryCreateInputSchema` leaves `accessLevel`
  `undefined` when the client omits it; §3c's "defaults to
  `accessLevel: "private"` (D36)" is satisfied because the *setting's
  own* default value is `"private"` until the user changes it — this
  package has no settings lookup available at parse time to do that
  substitution itself.
- **`includeInHandoff`'s per-origin default** (`true` for
  `support_note`, `false` for every other origin) is applied by this
  package's own `.transform`, since §3's data-model sketch states the
  support-note case explicitly but not the others.
- **Tags**: a deduped array of short (<=40 char), non-empty strings,
  capped at 20 — §3c only says "add ... `tags`" with no shape.
- **Mood**: `1`–`5` integer or `null` — not every entry records one.
- **`MemoryReviewActionInputSchema` doesn't itself check `origin`.**
  D38 restricts review to `ai_proposal` memories, but a schema parsing
  only the review request body has no access to the *existing* record's
  `origin` — the handler must reject a review call against a
  `"user"`-origin memory (e.g. with `CONFLICT`).
- **The 30-second lockout delay after 5 failed unlock attempts (§3c)**
  is not modeled as its own field anywhere — it surfaces, if at all,
  through `ApiErrorResponseSchema`'s existing `details` (handler-built,
  never a raw request echo), not a new schema.
- **`Device`'s shape** (`label`/`platform`, no `tokenHash`) is this
  package's own default — §3c doesn't redefine `devices` at all (P1,
  unused until phone pairing starts).
- **Query schemas (`limit`, `cursor`, `q`, `status`, `origin`) are
  `.strict()` too**, even though §3c's "API inputs use `.strict()`"
  line reads most naturally as being about request bodies — applied
  uniformly for one consistent rule rather than a body/query split.

## Flagged ambiguities (not resolved by this revision — need an answer, not a guess)

- **Does a diary excerpt's `sources` ever include more than one
  message**, e.g. a multi-turn exchange saved as one excerpt? The
  schema allows it (`sources: [...].min(1)`, no max), but nothing in
  §3c or the P0 feature description says whether the UI ever offers
  that. Left permissive; narrow it later if the UI never needs it.
- **Soft-delete-with-nulled-content** (§3's informal sketch: `deleted_at`
  columns, content nulled in place) is a DB-storage-layer detail this
  package deliberately does NOT model on the public `*RecordSchema`
  types — those only ever describe a non-deleted row; a deleted item is
  addressed through its `TombstoneRecord` instead, and a `GET` on a
  deleted id presumably 404s. If any route actually needs to return a
  "this exists but is deleted" shape (rather than plain `NOT_FOUND`),
  that's a new contract, not covered here.
- **`GET /api/privacy-status`'s `model`/`acceleration`/`memoryUsedGb`/
  `lastReply` fields are A's to populate** (§3c says so explicitly),
  but no A code exists yet to confirm the exact value vocabulary
  (e.g. whether `acceleration` ever needs a 5th value beyond
  `cuda`/`vulkan`/`cpu`/`unknown`, or whether ROCm gets its own tag per
  §3a). Confirm with Jason before Phase 5.
