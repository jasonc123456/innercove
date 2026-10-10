import { randomBytes } from "node:crypto";
import type {
  ConversationId,
  ConversationRecord,
  DiaryEntryCandidate,
  DiaryEntryId,
  MemoryCandidateWithProvenance,
  MemoryId,
  MessageContextRecord,
  MessageId,
  MessageRecord,
  UserId,
} from "@innercove/core";
import { NotFoundError, type ChatStore } from "./ports.js";

/** RFC 9562 UUIDv7: 48-bit ms timestamp, version 7, variant 10. */
export function uuidv7(): string {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface DiaryRow extends DiaryEntryCandidate {
  deleted: boolean;
}
interface MemoryRow extends MemoryCandidateWithProvenance {
  deleted: boolean;
}

/**
 * In-memory stand-in for B's store, for tests and for dev until Phase 2 lands.
 * Follows the read-port eligibility contract in `packages/core/src/data-layer`:
 * user-scoped, `ai_eligible`, approved memories, not deleted, and no private,
 * deleted or unresolvable provenance source (fail closed). Not encrypted; dev only.
 */
export class InMemoryChatStore implements ChatStore {
  readonly userId: UserId;
  readonly diary = new Map<string, DiaryRow>();
  readonly memories = new Map<string, MemoryRow>();
  readonly conversations = new Map<string, ConversationRecord>();
  readonly messages: MessageRecord[] = [];
  readonly messageContext: MessageContextRecord[] = [];

  constructor(userId: string = uuidv7()) {
    this.userId = userId as UserId;
  }

  // ---- test and seed helpers --------------------------------------------
  addDiary(entry: Partial<DiaryEntryCandidate> & { content: string }): DiaryEntryId {
    const now = new Date().toISOString();
    const id = (entry.id ?? uuidv7()) as DiaryEntryId;
    this.diary.set(id, {
      origin: "manual",
      title: null,
      accessLevel: "private",
      includeInHandoff: false,
      tags: [],
      mood: null,
      createdAt: now,
      updatedAt: now,
      ...entry,
      id,
      userId: entry.userId ?? this.userId,
      deleted: false,
    });
    return id;
  }

  addMemory(
    memory: Partial<MemoryCandidateWithProvenance> & { content: string },
  ): MemoryId {
    const now = new Date().toISOString();
    const id = (memory.id ?? uuidv7()) as MemoryId;
    this.memories.set(id, {
      origin: "user",
      status: "approved",
      accessLevel: "ai_eligible",
      provenance: [],
      createdAt: now,
      updatedAt: now,
      ...memory,
      id,
      userId: memory.userId ?? this.userId,
      deleted: false,
    });
    return id;
  }

  setDiaryAccess(id: string, accessLevel: "private" | "ai_eligible") {
    const row = this.diary.get(id);
    if (row) row.accessLevel = accessLevel;
  }

  deleteDiary(id: string) {
    const row = this.diary.get(id);
    if (row) row.deleted = true;
  }

  // ---- DiaryMemoryReadPort ----------------------------------------------
  reads = {
    listDiaryCandidates: async ({ userId, limit, cursor }: { userId: UserId; limit: number; cursor?: string }) =>
      page([...this.diary.values()].filter((d) => this.diaryEligible(d, userId)), limit, cursor).map(strip),
    listMemoryCandidates: async ({ userId, limit, cursor }: { userId: UserId; limit: number; cursor?: string }) =>
      page([...this.memories.values()].filter((m) => this.memoryEligible(m, userId)), limit, cursor).map(strip),
  };

  // ---- MessageContextReadPort -------------------------------------------
  contexts = {
    listContextForMessages: async ({ userId, messageIds }: { userId: UserId; messageIds: MessageId[] }) => {
      const ids = new Set<string>(messageIds);
      return this.messageContext.filter((c) => c.userId === userId && ids.has(c.messageId));
    },
  };

  // ---- ConversationHistoryPort ------------------------------------------
  history = {
    listMessages: async ({ userId, conversationId }: { userId: UserId; conversationId: ConversationId }) => {
      const conv = this.conversations.get(conversationId);
      if (!conv || conv.userId !== userId) throw new NotFoundError("conversation not found");
      return this.messages.filter((m) => m.conversationId === conversationId && m.userId === userId);
    },
  };

  // ---- ConversationPersistencePort --------------------------------------
  persistence = {
    saveConversation: async (input: { userId: UserId; title?: string | null | undefined }) => {
      const now = new Date().toISOString();
      const rec: ConversationRecord = {
        id: uuidv7() as ConversationId,
        userId: input.userId,
        title: input.title ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.conversations.set(rec.id, rec);
      return rec;
    },
    appendMessage: async (input: Omit<MessageRecord, "id" | "createdAt">) => {
      const conv = this.conversations.get(input.conversationId);
      if (!conv || conv.userId !== input.userId) throw new NotFoundError("conversation not found");
      const last = this.messages.at(-1)?.createdAt ?? "";
      let createdAt = new Date().toISOString();
      if (createdAt <= last) createdAt = new Date(Date.parse(last) + 1).toISOString();
      const rec: MessageRecord = { ...input, id: uuidv7() as MessageId, createdAt };
      this.messages.push(rec);
      return rec;
    },
    recordMessageContext: async (input: MessageContextRecord) => {
      this.messageContext.push({ ...input });
      return input;
    },
  };

  private diaryEligible(d: DiaryRow, userId: UserId) {
    return d.userId === userId && !d.deleted && d.accessLevel === "ai_eligible";
  }

  private memoryEligible(m: MemoryRow, userId: UserId) {
    if (m.userId !== userId || m.deleted || m.accessLevel !== "ai_eligible" || m.status !== "approved") return false;
    return m.provenance.every((p) => {
      if (p.sourceType === "manual") return true;
      if (p.sourceType === "diary_entry") {
        const src = p.sourceId ? this.diary.get(p.sourceId) : undefined;
        return !!src && this.diaryEligible(src, userId);
      }
      return false; // message sources and anything unresolvable count as private (fail closed)
    });
  }
}

function page<T extends { id: string }>(rows: T[], limit: number, cursor?: string): T[] {
  const sorted = rows.sort((a, b) => a.id.localeCompare(b.id));
  const start = cursor ? sorted.findIndex((r) => r.id > cursor) : 0;
  return start === -1 ? [] : sorted.slice(start, start + limit);
}

function strip<T extends { deleted: boolean }>({ deleted: _deleted, ...rest }: T): Omit<T, "deleted"> {
  return rest;
}

interface DemoPersona {
  memories: { content: string; accessLevel: "private" | "ai_eligible" }[];
  diaryEntries: {
    date: string;
    title: string;
    mood: number | null;
    tags: string[];
    origin: "manual" | "excerpt" | "ai_draft" | "support_note";
    accessLevel: "private" | "ai_eligible";
    content: string;
  }[];
}

/** Loads the fictional persona (`docs/prep/demo-persona.json`) into a dev store. Never real data (D40). */
export function seedDemoPersona(store: InMemoryChatStore, persona: DemoPersona): void {
  for (const m of persona.memories) store.addMemory({ content: m.content, accessLevel: m.accessLevel });
  for (const d of persona.diaryEntries) {
    const at = new Date(`${d.date}T12:00:00Z`).toISOString();
    store.addDiary({
      title: d.title,
      content: d.content,
      mood: d.mood,
      tags: d.tags,
      origin: d.origin,
      accessLevel: d.accessLevel,
      createdAt: at,
      updatedAt: at,
    });
  }
}
