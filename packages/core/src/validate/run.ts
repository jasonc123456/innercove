/**
 * Boundary + example-payload validation for the shared contracts.
 *
 * IMPORTANT: this script only proves that these Zod schemas accept/
 * reject the shapes exercised below, at the moment a payload is
 * parsed. It proves NOTHING about runtime permission enforcement --
 * whether a server handler actually calls `.parse()` before trusting
 * a request, whether a database query is correctly scoped to
 * `userId`, or whether a locked-vault check actually runs before a
 * handler touches diary/memory data are all real implementation
 * concerns this script cannot see and does not claim to cover.
 */
import assert from "node:assert/strict";

import {
  UserIdSchema,
  ConversationRecordSchema,
  MessageRecordSchema,
  ConversationCreateInputSchema,
  ConversationUpdateInputSchema,
  MessageCreateInputSchema,
  MessageContextRecordSchema,
  MessageContextCreateInputSchema,
  MessageContextSourceRefSchema,
  DiaryEntryRecordSchema,
  DiaryEntryCreateInputSchema,
  DiaryEntryUpdateInputSchema,
  MemoryRecordSchema,
  MemoryCreateInputSchema,
  MemoryUpdateInputSchema,
  MemoryReviewActionInputSchema,
  ProvenanceLinkRecordSchema,
  ProvenanceLinkCreateInputSchema,
  DeviceRecordSchema,
  DeviceCreateInputSchema,
  DeviceUpdateInputSchema,
  DeviceRevokeInputSchema,
  TombstoneRecordSchema,
  TOMBSTONE_ALLOWED_KEYS,
  UserSettingsRecordSchema,
  UserSettingsUpdateInputSchema,
  PrivacyStatusSchema,
  LockStatusResponseSchema,
  SetupRequestSchema,
  SetupResponseSchema,
  UnlockRequestSchema,
  UnlockResponseSchema,
  LockResponseSchema,
  CreateConversationRequestSchema,
  ListConversationsQuerySchema,
  ListConversationsResponseSchema,
  ListMessagesQuerySchema,
  ListMessagesResponseSchema,
  DeleteConversationResponseSchema,
  ListDiaryEntriesQuerySchema,
  ListDiaryEntriesResponseSchema,
  DeleteDiaryEntryResponseSchema,
  ListMemoriesQuerySchema,
  ListMemoriesResponseSchema,
  CreateMemoryRequestSchema,
  ReviewMemoryRequestSchema,
  DeleteMemoryResponseSchema,
  DeleteAllRequestSchema,
  DeleteAllResponseSchema,
  ApiErrorResponseSchema,
  ApiErrorCodeSchema,
  mostRestrictiveAccess,
  type UserSettingsRecord,
} from "../index.js";
import * as examples from "../examples/index.js";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${label}`);
}

// ------------------------------------------------------------- 1. examples --
check("exampleSavedConversation parses, with no isTemporary field at all", () => {
  const parsed = ConversationRecordSchema.parse(examples.exampleSavedConversation) as Record<string, unknown>;
  assert.equal("isTemporary" in parsed, false);
});
check("exampleMessages parse, carrying safetyTier and modelId", () => {
  for (const m of examples.exampleMessages) MessageRecordSchema.parse(m);
});
check("MessageCreateInput (the data-layer appendMessage input) parses and rejects unknown fields", () => {
  MessageCreateInputSchema.parse({
    conversationId: examples.exampleSavedConversation.id,
    role: "assistant",
    content: "One more thing --",
    safetyTier: 0,
    modelId: "qwen3.8-27b",
  });
  assert.throws(() =>
    MessageCreateInputSchema.parse({
      conversationId: examples.exampleSavedConversation.id,
      role: "user",
      content: "hi",
      safetyTier: 0,
      modelId: null,
      extra: "nope",
    }),
  );
});
check("diary entries (manual / support note / excerpt) parse", () => {
  DiaryEntryRecordSchema.parse(examples.exampleDiaryEntryManual);
  DiaryEntryRecordSchema.parse(examples.exampleDiaryEntrySupportNote);
  DiaryEntryRecordSchema.parse(examples.exampleDiaryEntryExcerpt);
});
check("memories (user-origin approved / ai_proposal proposed-approved-rejected) parse", () => {
  MemoryRecordSchema.parse(examples.exampleUserOriginMemory);
  MemoryRecordSchema.parse(examples.exampleAiProposalMemory);
  MemoryRecordSchema.parse(examples.exampleApprovedAiProposalMemory);
  MemoryRecordSchema.parse(examples.exampleRejectedAiProposalMemory);
});
check("generic provenance parses for BOTH derivedType branches (memory AND diary_entry), retaining every field", () => {
  const derivedTypes = new Set<string>();
  for (const p of examples.exampleProvenanceLinks) {
    const parsed = ProvenanceLinkRecordSchema.parse(p) as Record<string, unknown>;
    derivedTypes.add(parsed.derivedType as string);
    // Regression guard for the cross-operand z.intersection strictness
    // bug (fixed in this revision): every field from BOTH the
    // userId-only side and the derivedType/sourceType side must
    // survive the parse, not just whichever side "won".
    for (const key of ["userId", "derivedType", "derivedId", "sourceType", "sourceId"]) {
      assert.ok(key in parsed, `expected "${key}" to survive parsing ${JSON.stringify(p)}`);
    }
  }
  assert.deepEqual(derivedTypes, new Set(["memory", "diary_entry"]));
});
check("ProvenanceLinkRecord REJECTS an unknown field (regression: used to silently pass, see provenance.ts)", () => {
  assert.throws(() => ProvenanceLinkRecordSchema.parse({ ...examples.exampleProvenanceLinks[0], hacked: true }));
});
check("ProvenanceLinkRecord REJECTS an invalid discriminant and an invalid id", () => {
  assert.throws(() =>
    ProvenanceLinkRecordSchema.parse({ ...examples.exampleProvenanceLinks[0], derivedType: "not_a_real_type" }),
  );
  assert.throws(() =>
    ProvenanceLinkRecordSchema.parse({ ...examples.exampleProvenanceLinks[0], derivedId: "not-a-uuidv7" }),
  );
});
check("messageContext records parse, retaining every field (userId + messageId + source ref)", () => {
  for (const c of examples.exampleMessageContext) {
    const parsed = MessageContextRecordSchema.parse(c) as Record<string, unknown>;
    for (const key of ["userId", "messageId", "sourceType", "sourceId"]) {
      assert.ok(key in parsed, `expected "${key}" to survive parsing ${JSON.stringify(c)}`);
    }
  }
});
check("MessageContextRecord REJECTS an unknown field (regression: used to silently pass)", () => {
  assert.throws(() => MessageContextRecordSchema.parse({ ...examples.exampleMessageContext[0], hacked: true }));
});
check("messageContext create input parses, and has no 'manual' sourceType (unlike provenance)", () => {
  MessageContextCreateInputSchema.parse({
    messageId: examples.exampleMessages[1]!.id,
    sourceType: "memory",
    sourceId: examples.exampleMemoryId,
  });
  assert.throws(() =>
    MessageContextSourceRefSchema.parse({ sourceType: "manual", sourceId: null }),
  );
});
check("MessageContextCreateInput REJECTS an unknown field (regression: used to silently pass)", () => {
  assert.throws(() =>
    MessageContextCreateInputSchema.parse({
      messageId: examples.exampleMessages[1]!.id,
      sourceType: "memory",
      sourceId: examples.exampleMemoryId,
      hacked: true,
    }),
  );
});
check("exampleDevice parses", () => {
  DeviceRecordSchema.parse(examples.exampleDevice);
});
check("exampleTombstone parses, retaining every field", () => {
  const parsed = TombstoneRecordSchema.parse(examples.exampleTombstone) as Record<string, unknown>;
  for (const key of ["id", "userId", "entityType", "entityId", "reason", "deletedAt"]) {
    assert.ok(key in parsed, `expected "${key}" to survive parsing`);
  }
});
check("TombstoneRecord REJECTS an unknown (content-shaped) field (regression: used to silently pass)", () => {
  assert.throws(() => TombstoneRecordSchema.parse({ ...examples.exampleTombstone, content: "leaked!" }));
});
check("settings / privacy status (locked, unlocked, encryption-off) parse", () => {
  UserSettingsRecordSchema.parse(examples.exampleUserSettings);
  PrivacyStatusSchema.parse(examples.examplePrivacyStatusLocked);
  PrivacyStatusSchema.parse(examples.examplePrivacyStatusUnlocked);
  const offStatus = PrivacyStatusSchema.parse(examples.examplePrivacyStatusEncryptionOff) as { encryption: string };
  assert.equal(offStatus.encryption, "off"); // honest-disclosure case, D26
});
check("lock-status / setup / unlock / lock payloads parse", () => {
  LockStatusResponseSchema.parse(examples.exampleLockStatus);
  SetupRequestSchema.parse(examples.exampleSetupRequest);
  SetupResponseSchema.parse(examples.exampleSetupResponse);
  UnlockRequestSchema.parse(examples.exampleUnlockRequest);
  UnlockResponseSchema.parse(examples.exampleUnlockResponse);
  LockResponseSchema.parse(examples.exampleLockResponse);
});
check("create conversation / memory / review / delete-all requests parse", () => {
  CreateConversationRequestSchema.parse(examples.exampleCreateConversationRequest);
  CreateMemoryRequestSchema.parse(examples.exampleCreateUserMemoryRequest);
  CreateMemoryRequestSchema.parse(examples.exampleCreateAiProposalMemoryRequest);
  ReviewMemoryRequestSchema.parse(examples.exampleApproveMemoryRequest);
  ReviewMemoryRequestSchema.parse(examples.exampleRejectMemoryRequest);
  DeleteAllRequestSchema.parse(examples.exampleDeleteAllRequest);
  DeleteAllResponseSchema.parse(examples.exampleDeleteAllResponse);
});
check("LOCKED and MODEL_UNAVAILABLE error responses both parse against the same shape", () => {
  ApiErrorResponseSchema.parse(examples.exampleLockedErrorResponse);
  ApiErrorResponseSchema.parse(examples.exampleModelUnavailableErrorResponse);
  assert.deepEqual([...ApiErrorCodeSchema.options], [
    "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "LOCKED", "INTERNAL_ERROR", "MODEL_UNAVAILABLE",
  ]);
});

// --------------------------------------------- 1b. most-restrictive-access --
check("mostRestrictiveAccess picks private over ai_eligible regardless of order", () => {
  assert.equal(mostRestrictiveAccess(["ai_eligible", "private"]), "private");
  assert.equal(mostRestrictiveAccess(["private", "ai_eligible"]), "private");
});
check("mostRestrictiveAccess returns ai_eligible only when EVERY source is ai_eligible", () => {
  assert.equal(mostRestrictiveAccess(["ai_eligible", "ai_eligible"]), "ai_eligible");
});
check("mostRestrictiveAccess throws on an empty source list rather than guessing", () => {
  assert.throws(() => mostRestrictiveAccess([]));
});
check("a memory derived from a private diary entry must itself be private", () => {
  assert.equal(mostRestrictiveAccess([examples.exampleDiaryEntrySupportNote.accessLevel]), "private");
});

// --------------------------------------------------------- 2. invalid IDs --
check("a well-formed UUIDv7 is accepted", () => {
  UserIdSchema.parse("018f0a1e-2b3c-7d4e-8f5a-6b7c8d9e0f1a");
});
check("a UUIDv4 (wrong version nibble) is rejected", () => {
  assert.throws(() => UserIdSchema.parse("3fa85f64-5717-4562-b3fc-2c963f66afa6"));
});
check("a non-UUID string is rejected", () => {
  assert.throws(() => UserIdSchema.parse("not-an-id"));
});
check("an empty string is rejected", () => {
  assert.throws(() => UserIdSchema.parse(""));
});

// --------------------------------- 3. client-supplied ownership: now REJECTED,
// not silently stripped (§3c: "API inputs use .strict() Zod objects") --
// the key behavior change this revision makes relative to the first draft.
check("MemoryCreateInput REJECTS a client-supplied userId/id/status (strict, not stripped)", () => {
  const withOwnership = {
    ...examples.exampleCreateUserMemoryRequest,
    userId: "attacker-controlled-id",
    id: "attacker-controlled-id",
    status: "approved",
  };
  assert.throws(() => MemoryCreateInputSchema.parse(withOwnership));
});
check("ConversationCreateInput REJECTS a client-supplied userId/id (strict, not stripped)", () => {
  const withOwnership = { ...examples.exampleCreateConversationRequest, userId: "x", id: "y" };
  assert.throws(() => ConversationCreateInputSchema.parse(withOwnership));
});
check("DeviceCreateInput REJECTS an unknown field", () => {
  assert.throws(() => DeviceCreateInputSchema.parse({ label: "x", platform: "web", userId: "y" }));
});

// --------------------------------------------- 4. malformed create/update --
check("MemoryCreateInput rejects a missing required field", () => {
  assert.throws(() => MemoryCreateInputSchema.parse({ origin: "user", content: "x" })); // missing accessLevel + sources
});
check("ConversationUpdateInput accepts an empty patch and a real partial patch", () => {
  ConversationUpdateInputSchema.parse({});
  ConversationUpdateInputSchema.parse({ title: "Renamed" });
});
check("DiaryEntryUpdateInput accepts an empty patch and a real partial patch; rejects origin/sources", () => {
  DiaryEntryUpdateInputSchema.parse({});
  DiaryEntryUpdateInputSchema.parse({ mood: 4, tags: ["work"] });
  assert.throws(() => DiaryEntryUpdateInputSchema.parse({ origin: "manual" }));
});
check("MemoryUpdateInput never accepts status or origin (they are not fields on this schema)", () => {
  assert.throws(() => MemoryUpdateInputSchema.parse({ status: "approved" }));
  assert.throws(() => MemoryUpdateInputSchema.parse({ origin: "ai_proposal" }));
  MemoryUpdateInputSchema.parse({ content: "edited" }); // the real, accepted shape
});
check("MemoryCreateInput has no status field to even smuggle a value through", () => {
  assert.throws(() => MemoryCreateInputSchema.parse({ ...examples.exampleCreateUserMemoryRequest, status: "approved" }));
});
check('DiaryEntryCreateInput requires sources when origin is "excerpt"', () => {
  assert.throws(() => DiaryEntryCreateInputSchema.parse({ origin: "excerpt", content: "no source given" }));
  DiaryEntryCreateInputSchema.parse(examples.exampleCreateExcerptRequest); // the real, accepted shape
});
check("DiaryEntryCreateInput defaults a support note's includeInHandoff to true when omitted", () => {
  const out = DiaryEntryCreateInputSchema.parse(examples.exampleCreateSupportNoteRequest) as {
    includeInHandoff: boolean;
  };
  assert.equal(out.includeInHandoff, true);
});
check("D30: an omitted support-note accessLevel is forced private, UNCONDITIONALLY -- independent of diaryDefaultAccessLevel", () => {
  // Construct the exact scenario the task calls out: the user's
  // configurable setting is "ai_eligible" (D36 allows changing the
  // default), and a NEW support note's create request omits
  // accessLevel entirely. This schema never reads UserSettingsRecord
  // at all -- the point of this check is that the note's resolved
  // accessLevel is "private" regardless, proving the two mechanisms
  // (D36's general, configurable default vs. D30's note-specific,
  // unconditional one) are independent, not that one overrides the
  // other at runtime (that's the handler's job -- see README.md).
  const settingsWithAiEligibleDefault: UserSettingsRecord = {
    ...examples.exampleUserSettings,
    diaryDefaultAccessLevel: "ai_eligible",
  };
  assert.equal(settingsWithAiEligibleDefault.diaryDefaultAccessLevel, "ai_eligible"); // sanity on the fixture
  const out = DiaryEntryCreateInputSchema.parse(examples.exampleCreateSupportNoteRequest) as {
    origin: string;
    accessLevel: string | undefined;
  };
  assert.equal(out.origin, "support_note");
  assert.equal(out.accessLevel, "private");
});
check("D30: an EXPLICIT accessLevel on a support note is still respected (the default, not a forced override)", () => {
  const out = DiaryEntryCreateInputSchema.parse({
    origin: "support_note",
    content: "the user explicitly turned this on",
    accessLevel: "ai_eligible",
  }) as { accessLevel: string | undefined };
  assert.equal(out.accessLevel, "ai_eligible");
});
check("DiaryEntryCreateInput defaults a manual entry's includeInHandoff to false when omitted", () => {
  const out = DiaryEntryCreateInputSchema.parse(examples.exampleCreateManualEntryRequest) as {
    includeInHandoff: boolean;
    accessLevel: string | undefined;
  };
  assert.equal(out.includeInHandoff, false);
  // accessLevel stays undefined here -- the HANDLER fills in
  // settings.diaryDefaultAccessLevel, this schema does not hardcode it.
  assert.equal(out.accessLevel, undefined);
});
check("DiaryEntryCreateInput respects an EXPLICIT includeInHandoff on a support note", () => {
  const out = DiaryEntryCreateInputSchema.parse({
    origin: "support_note",
    content: "explicit choice",
    includeInHandoff: false,
  }) as { includeInHandoff: boolean };
  assert.equal(out.includeInHandoff, false);
});
check("MemoryReviewAction only ever accepts status approved/rejected, strictly", () => {
  assert.throws(() => MemoryReviewActionInputSchema.parse({ status: "proposed" }));
  assert.throws(() => MemoryReviewActionInputSchema.parse({ status: "approved", useEnabled: true })); // dropped field
  MemoryReviewActionInputSchema.parse(examples.exampleApproveMemoryRequest);
  MemoryReviewActionInputSchema.parse(examples.exampleRejectMemoryRequest);
});
check("ProvenanceLinkCreateInput rejects a mismatched derivedType/sourceType pairing shape but accepts real ones", () => {
  ProvenanceLinkCreateInputSchema.parse({
    derivedType: "diary_entry",
    derivedId: examples.exampleDiaryEntryExcerpt.id,
    sourceType: "message",
    sourceId: examples.exampleMessages[1]!.id,
  });
  ProvenanceLinkCreateInputSchema.parse({
    derivedType: "memory",
    derivedId: examples.exampleMemoryId,
    sourceType: "manual",
    sourceId: null,
  });
  assert.throws(() =>
    ProvenanceLinkCreateInputSchema.parse({
      derivedType: "memory",
      derivedId: examples.exampleMemoryId,
      sourceType: "message",
      sourceId: null, // message sources always need a real id, never null
    }),
  );
});
check("DeviceUpdateInput / DeviceRevokeInput parse realistic payloads", () => {
  DeviceUpdateInputSchema.parse({ label: "Renamed laptop" });
  DeviceRevokeInputSchema.parse({ deviceId: examples.exampleDevice.id });
});
check("UserSettingsUpdateInput: empty patch and a real partial patch both parse", () => {
  UserSettingsUpdateInputSchema.parse({});
  UserSettingsUpdateInputSchema.parse({ diaryDefaultAccessLevel: "ai_eligible" });
});

// ------------------------------------- 5. accidental private-field exposure --
check("Setup/Unlock/Lock response shapes never include a passphrase-shaped field", () => {
  for (const parsed of [
    SetupResponseSchema.parse(examples.exampleSetupResponse),
    UnlockResponseSchema.parse(examples.exampleUnlockResponse),
    LockResponseSchema.parse(examples.exampleLockResponse),
  ] as Record<string, unknown>[]) {
    const keys = Object.keys(parsed).map((k) => k.toLowerCase());
    for (const forbidden of ["passphrase", "password", "secret", "key"]) {
      assert.equal(keys.some((k) => k.includes(forbidden)), false, `found forbidden key matching "${forbidden}"`);
    }
  }
});
check("Tombstone parsed output carries ONLY the allowed, content-free camelCase keys", () => {
  const parsed = TombstoneRecordSchema.parse(examples.exampleTombstone) as Record<string, unknown>;
  const keys = Object.keys(parsed).sort();
  assert.deepEqual(keys, [...TOMBSTONE_ALLOWED_KEYS].sort());
  assert.equal("user_id" in parsed, false); // the old snake_case name must be gone
});
check("PrivacyStatus honestly reports encryption=off and never implies sqlcipher when it is", () => {
  const off = PrivacyStatusSchema.parse(examples.examplePrivacyStatusEncryptionOff) as { encryption: string };
  assert.notEqual(off.encryption, "sqlcipher");
});

// ------------------------------------------------- 6. list/delete envelopes --
check("List query schemas accept an empty query and fill in their own limit default", () => {
  const c = ListConversationsQuerySchema.parse({}) as { limit: number };
  const d = ListDiaryEntriesQuerySchema.parse({}) as { limit: number };
  const m = ListMemoriesQuerySchema.parse({}) as { limit: number };
  const msg = ListMessagesQuerySchema.parse({}) as { limit: number };
  assert.equal(c.limit, 20);
  assert.equal(d.limit, 20);
  assert.equal(m.limit, 20);
  assert.equal(msg.limit, 50);
});
check("ListDiaryEntriesQuery accepts the FTS `q` param; ListMemoriesQuery accepts status+origin filters", () => {
  ListDiaryEntriesQuerySchema.parse({ q: "exam week" });
  ListMemoriesQuerySchema.parse({ status: "proposed", origin: "ai_proposal" });
});
check("List response envelopes parse with real records and a null cursor", () => {
  ListConversationsResponseSchema.parse({ conversations: [examples.exampleSavedConversation], nextCursor: null });
  ListDiaryEntriesResponseSchema.parse({ entries: [examples.exampleDiaryEntryManual], nextCursor: null });
  ListMemoriesResponseSchema.parse({ memories: [examples.exampleUserOriginMemory], nextCursor: null });
  ListMessagesResponseSchema.parse({ messages: examples.exampleMessages });
});
check("Delete response envelopes parse with a real tombstone", () => {
  DeleteConversationResponseSchema.parse({ tombstone: examples.exampleTombstone });
  DeleteDiaryEntryResponseSchema.parse({ tombstone: examples.exampleTombstone });
  DeleteMemoryResponseSchema.parse({ tombstone: examples.exampleTombstone });
});

console.log(`\n${passed} checks passed.`);
console.log(
  "\nReminder: these are schema-shape checks only. They do not prove that any " +
    "server handler actually enforces locking, user scoping, or approval " +
    "gating at runtime -- see this file's own header comment.",
);
