/**
 * Fictional example payloads for mocks (Mia/frontend) -- every value
 * here is validated against its own schema by validate/run.ts. Names,
 * content, and ids are entirely fictional.
 */
import {
  UserIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  DiaryEntryIdSchema,
  MemoryIdSchema,
  DeviceIdSchema,
  TombstoneIdSchema,
  type UserId,
} from "../types/ids.js";
import type { ConversationRecord, MessageRecord } from "../types/conversation.js";
import type { MessageContextRecord } from "../types/message-context.js";
import type { DiaryEntryRecord, DiaryEntryCreateRawInput } from "../types/diary.js";
import type { MemoryRecord } from "../types/memory.js";
import type { ProvenanceLinkRecord } from "../types/provenance.js";
import type { DeviceRecord } from "../types/device.js";
import type { TombstoneRecord } from "../types/tombstone.js";
import type { UserSettingsRecord, PrivacyStatus } from "../types/settings.js";
import {
  mostRestrictiveAccess,
} from "../types/access.js";
import type {
  LockStatusResponse,
  SetupRequest,
  SetupResponse,
  UnlockRequest,
  UnlockResponse,
  LockResponse,
} from "../api/unlock.js";
import type { CreateConversationRequest } from "../api/conversations.js";
import type { CreateMemoryRequest, ReviewMemoryRequest } from "../api/memories.js";
import type { DeleteAllRequest, DeleteAllResponse } from "../api/delete-all.js";
import type { ApiErrorResponse } from "../api/errors.js";

const exampleUserId: UserId = UserIdSchema.parse("018f0a1e-2b3c-7d4e-8f5a-6b7c8d9e0f1a");

export const exampleUser = { id: exampleUserId };

// -------------------------------------------------------------- conversation --
export const exampleSavedConversation: ConversationRecord = {
  id: ConversationIdSchema.parse("018f0a1e-33aa-7001-8bbb-0000000000a1"),
  userId: exampleUserId,
  title: "Late-night thoughts",
  createdAt: "2026-02-14T23:10:00.000Z",
  updatedAt: "2026-02-14T23:22:00.000Z",
};

export const exampleMessages: MessageRecord[] = [
  {
    id: MessageIdSchema.parse("018f0a1e-44bb-7001-8ccc-0000000000b1"),
    conversationId: exampleSavedConversation.id,
    userId: exampleUserId,
    role: "user",
    content: "I keep replaying the conversation with my sister.",
    safetyTier: 0,
    modelId: null,
    createdAt: "2026-02-14T23:10:05.000Z",
  },
  {
    id: MessageIdSchema.parse("018f0a1e-44bb-7002-8ccc-0000000000b2"),
    conversationId: exampleSavedConversation.id,
    userId: exampleUserId,
    role: "assistant",
    content: "That sounds like it's been sitting heavily with you. What part keeps coming back?",
    safetyTier: 0,
    modelId: "qwen3.8-27b",
    createdAt: "2026-02-14T23:10:40.000Z",
  },
];

// ------------------------------------------------------------------- diary --
export const exampleDiaryEntryManual: DiaryEntryRecord = {
  id: DiaryEntryIdSchema.parse("018f0a1e-55cc-7001-8ddd-0000000000c1"),
  userId: exampleUserId,
  origin: "manual",
  title: "Morning pages",
  content: "Slept badly again. Trying to notice the pattern before I spiral about it.",
  accessLevel: "ai_eligible",
  includeInHandoff: false,
  tags: ["sleep"],
  mood: 2,
  createdAt: "2026-02-10T07:05:00.000Z",
  updatedAt: "2026-02-10T07:05:00.000Z",
};

export const exampleDiaryEntrySupportNote: DiaryEntryRecord = {
  id: DiaryEntryIdSchema.parse("018f0a1e-55cc-7002-8ddd-0000000000c2"),
  userId: exampleUserId,
  origin: "support_note",
  title: "Saved from tonight's conversation",
  content: "Named three people I can call if it gets bad again.",
  // Defaulted by DiaryEntryCreateInputSchema when the create request
  // omitted it -- see exampleCreateSupportNoteRequest below. Every new
  // entry defaults to "private" (D36), not just support notes.
  accessLevel: "private",
  // Support notes default includeInHandoff=true (§3's own sketch);
  // see the same create request.
  includeInHandoff: true,
  tags: [],
  mood: null,
  createdAt: "2026-02-13T22:40:00.000Z",
  updatedAt: "2026-02-13T22:40:00.000Z",
};

export const exampleDiaryEntryExcerpt: DiaryEntryRecord = {
  id: DiaryEntryIdSchema.parse("018f0a1e-55cc-7003-8ddd-0000000000c3"),
  userId: exampleUserId,
  origin: "excerpt",
  title: null,
  content: "That sounds like it's been sitting heavily with you. What part keeps coming back?",
  accessLevel: "private",
  includeInHandoff: false,
  tags: [],
  mood: null,
  createdAt: "2026-02-14T23:15:00.000Z",
  updatedAt: "2026-02-14T23:15:00.000Z",
};

// -------------------------------------------------------------- provenance --
export const exampleMemoryId = MemoryIdSchema.parse("018f0a1e-77ee-7001-8fff-0000000000e1");

export const exampleProvenanceLinks: ProvenanceLinkRecord[] = [
  {
    userId: exampleUserId,
    derivedType: "memory",
    derivedId: exampleMemoryId,
    sourceType: "message",
    sourceId: exampleMessages[0]!.id,
  },
  {
    userId: exampleUserId,
    derivedType: "memory",
    derivedId: exampleMemoryId,
    sourceType: "diary_entry",
    sourceId: exampleDiaryEntryManual.id,
  },
  // The excerpt diary entry's own provenance, back to the message it
  // was saved from -- `derivedType: "diary_entry"`, proving provenance
  // is generic and not memory-only (the gap this revision closes).
  {
    userId: exampleUserId,
    derivedType: "diary_entry",
    derivedId: exampleDiaryEntryExcerpt.id,
    sourceType: "message",
    sourceId: exampleMessages[1]!.id,
  },
];

// ----------------------------------------------------------- messageContext --
export const exampleMessageContext: MessageContextRecord[] = [
  {
    userId: exampleUserId,
    messageId: exampleMessages[1]!.id,
    sourceType: "diary_entry",
    sourceId: exampleDiaryEntryManual.id,
  },
  {
    userId: exampleUserId,
    messageId: exampleMessages[1]!.id,
    sourceType: "memory",
    sourceId: exampleMemoryId,
  },
];

// -------------------------------------------------------------------- memory --
// "Derived items inherit the most restrictive source access": this
// memory's provenance is one message (no accessLevel of its own) +
// one diary entry ("ai_eligible") -- see access.ts.
const exampleMemoryAccessLevel = mostRestrictiveAccess([exampleDiaryEntryManual.accessLevel]);

export const exampleUserOriginMemory: MemoryRecord = {
  id: exampleMemoryId,
  userId: exampleUserId,
  // D38: a "user" origin memory is approved the moment it's created.
  origin: "user",
  status: "approved",
  content: "Sleep quality seems to drop after unresolved conflict with family.",
  accessLevel: exampleMemoryAccessLevel,
  createdAt: "2026-02-14T23:30:00.000Z",
  updatedAt: "2026-02-14T23:30:00.000Z",
};

export const exampleAiProposalMemory: MemoryRecord = {
  ...exampleUserOriginMemory,
  id: MemoryIdSchema.parse("018f0a1e-77ee-7002-8fff-0000000000e2"),
  origin: "ai_proposal",
  status: "proposed",
};

export const exampleApprovedAiProposalMemory: MemoryRecord = {
  ...exampleAiProposalMemory,
  id: MemoryIdSchema.parse("018f0a1e-77ee-7003-8fff-0000000000e3"),
  status: "approved",
};

export const exampleRejectedAiProposalMemory: MemoryRecord = {
  ...exampleAiProposalMemory,
  id: MemoryIdSchema.parse("018f0a1e-77ee-7004-8fff-0000000000e4"),
  status: "rejected",
};

// ------------------------------------------------------------------- device --
export const exampleDevice: DeviceRecord = {
  id: DeviceIdSchema.parse("018f0a1e-88ff-7001-8000-0000000000f1"),
  userId: exampleUserId,
  label: "Angela's iPhone",
  platform: "ios",
  lastSeenAt: "2026-02-14T23:35:00.000Z",
  createdAt: "2025-11-01T12:00:00.000Z",
  revokedAt: null,
};

// --------------------------------------------------------------- tombstone --
export const exampleTombstone: TombstoneRecord = {
  id: TombstoneIdSchema.parse("018f0a1e-9900-7001-8111-000000000011"),
  userId: exampleUserId,
  entityType: "memory",
  entityId: exampleMemoryId,
  reason: "user_deleted",
  deletedAt: "2026-02-16T08:00:00.000Z",
};

// ------------------------------------------------- settings / privacy status --
export const exampleUserSettings: UserSettingsRecord = {
  userId: exampleUserId,
  useMemoriesDefault: true,
  diaryDefaultAccessLevel: "private",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const examplePrivacyStatusLocked: PrivacyStatus = {
  locked: true,
  encryption: "sqlcipher",
  dataPath: "/data/innercove.db",
  model: { id: "qwen3.8-27b", endpointClass: "loopback" },
  acceleration: "cuda",
  memoryUsedGb: null,
  lastReply: null,
};

export const examplePrivacyStatusUnlocked: PrivacyStatus = {
  locked: false,
  encryption: "sqlcipher",
  dataPath: "/data/innercove.db",
  model: { id: "qwen3.8-27b", endpointClass: "loopback" },
  acceleration: "cuda",
  memoryUsedGb: 42.5,
  lastReply: { firstWordMs: 410, tokPerS: 11.2 },
};

/** The honest-disclosure case (D26's emergency switch): the fallback
 * is active and the panel must say so, never claim SQLCipher. */
export const examplePrivacyStatusEncryptionOff: PrivacyStatus = {
  ...examplePrivacyStatusUnlocked,
  encryption: "off",
};

// -------------------------------------------------------------- lock/unlock --
export const exampleLockStatus: LockStatusResponse = {
  hasPassphrase: true,
  locked: true,
};

export const exampleSetupRequest: SetupRequest = {
  passphrase: "correct-horse-battery-staple",
};
export const exampleSetupResponse: SetupResponse = { locked: false };

export const exampleUnlockRequest: UnlockRequest = {
  passphrase: "correct-horse-battery-staple",
};
export const exampleUnlockResponse: UnlockResponse = { locked: false };

export const exampleLockResponse: LockResponse = { locked: true };

// -------------------------------------------------------------- requests --
export const exampleCreateConversationRequest: CreateConversationRequest = {
  title: "Evening check-in",
};

/** accessLevel/includeInHandoff intentionally omitted -- this is the
 * input that produces exampleDiaryEntrySupportNote above. */
export const exampleCreateSupportNoteRequest: DiaryEntryCreateRawInput = {
  origin: "support_note",
  title: "Saved from tonight's conversation",
  content: "Named three people I can call if it gets bad again.",
};

/** A manual entry with accessLevel also omitted -- the HANDLER (not
 * this schema) fills in `settings.diaryDefaultAccessLevel`. */
export const exampleCreateManualEntryRequest: DiaryEntryCreateRawInput = {
  origin: "manual",
  title: "Morning pages",
  content: "Slept badly again. Trying to notice the pattern before I spiral about it.",
};

export const exampleCreateExcerptRequest: DiaryEntryCreateRawInput = {
  origin: "excerpt",
  content: "That sounds like it's been sitting heavily with you. What part keeps coming back?",
  sources: [{ sourceType: "message", sourceId: exampleMessages[1]!.id }],
};

export const exampleCreateUserMemoryRequest: CreateMemoryRequest = {
  origin: "user",
  content: "Sleep quality seems to drop after unresolved conflict with family.",
  accessLevel: exampleMemoryAccessLevel,
  sources: [
    { sourceType: "message", sourceId: exampleMessages[0]!.id },
    { sourceType: "diary_entry", sourceId: exampleDiaryEntryManual.id },
  ],
};

export const exampleCreateAiProposalMemoryRequest: CreateMemoryRequest = {
  ...exampleCreateUserMemoryRequest,
  origin: "ai_proposal",
};

export const exampleApproveMemoryRequest: ReviewMemoryRequest = { status: "approved" };
export const exampleRejectMemoryRequest: ReviewMemoryRequest = { status: "rejected" };

export const exampleDeleteAllRequest: DeleteAllRequest = { confirm: "DELETE" };
export const exampleDeleteAllResponse: DeleteAllResponse = {
  deleted: { conversations: 3, diaryEntries: 9, memories: 4 },
};

export const exampleLockedErrorResponse: ApiErrorResponse = {
  error: {
    code: "LOCKED",
    message: "Unlock the vault before accessing diary entries.",
  },
};

export const exampleModelUnavailableErrorResponse: ApiErrorResponse = {
  error: {
    code: "MODEL_UNAVAILABLE",
    message: "The local model is not reachable right now.",
  },
};
