import { and, asc, eq, gt, gte, inArray } from "drizzle-orm";
import {
  DiaryEntryRecordSchema, MemoryRecordSchema, type ConversationHistoryPort,
  type ConversationPersistencePort, type DiaryMemoryReadPort, type MessageContextReadPort,
  type RevocationReportingPort, type UserId,
} from "@innercove/core";
import { NotFoundError, type ChatStore, type NotesPort } from "../chat/ports.js";
import { MemoryRepository } from "./repos/memories.js";
import type { DatabaseLease } from "./db.js";
import { diaryEntries, memories, messages, messageContext, provenance, tombstones } from "./schema.js";
import { ConversationRepository } from "./repos/conversations.js";
import { PermissionPolicy } from "./permissions.js";
import { owner, requireRow } from "./repos/common.js";

/** Request-bound adapter: never caches a native connection across lock/reopen.
 * The HTTP guard retains this lease for the entire async/SSE handler. */
export class SqlChatStore implements ChatStore {
  readonly userId: UserId;
  readonly conversations: ConversationRepository;
  constructor(readonly lease: DatabaseLease) {
    this.userId = lease.userId;
    this.conversations = new ConversationRepository(lease);
  }
  private assertUser(userId: UserId) {
    if (userId !== this.userId) throw new NotFoundError("Item not found");
  }
  history: ConversationHistoryPort = {
    listMessages: async ({ userId, conversationId }) => {
      this.assertUser(userId);
      return this.conversations.listMessages(userId, conversationId);
    },
  };
  persistence: ConversationPersistencePort = {
    saveConversation: async ({ userId, ...input }) => {
      this.assertUser(userId);
      return this.conversations.create(userId, input);
    },
    appendMessage: async ({ userId, ...input }) => {
      this.assertUser(userId);
      return this.conversations.appendMessage(userId, input);
    },
    recordMessageContext: async (input) => this.writeContext(input),
    appendMessageWithContext: async ({ userId, ...input }, sources) => {
      this.assertUser(userId);
      return this.lease.db.transaction(() => {
        const message = this.conversations.appendMessage(userId, input);
        for (const source of sources) this.writeContext({ userId, messageId: message.id, ...source });
        return message;
      })();
    },
  };
  contexts: MessageContextReadPort = {
    listContextForMessages: async ({ userId, messageIds }) => {
      this.assertUser(userId);
      if (!messageIds.length) return [];
      // Batch to stay below SQLite's bound-parameter limit.
      const result = [];
      for (let i = 0; i < messageIds.length; i += 500) result.push(...this.lease.orm.select().from(messageContext)
        .where(and(eq(messageContext.userId, userId), inArray(messageContext.messageId, messageIds.slice(i, i + 500)))).all());
      return result as Awaited<ReturnType<MessageContextReadPort["listContextForMessages"]>>;
    },
  };
  reads: DiaryMemoryReadPort = {
    listDiaryCandidates: async ({ userId, limit, cursor }) => {
      this.assertUser(userId);
      const policy = new PermissionPolicy(this.lease, userId);
      return this.lease.orm.select().from(diaryEntries).where(and(eq(diaryEntries.userId, userId),
        eq(diaryEntries.accessLevel, "ai_eligible"), cursor ? gt(diaryEntries.id, cursor) : undefined))
        .orderBy(asc(diaryEntries.id)).all().filter(r => policy.eligible("diary_entry", r.id)).slice(0, limit)
        .map(r => DiaryEntryRecordSchema.parse(r));
    },
    listMemoryCandidates: async ({ userId, limit, cursor }) => {
      this.assertUser(userId);
      const policy = new PermissionPolicy(this.lease, userId);
      return this.lease.orm.select().from(memories).where(and(eq(memories.userId, userId),
        eq(memories.accessLevel, "ai_eligible"), eq(memories.status, "approved"), cursor ? gt(memories.id, cursor) : undefined))
        .orderBy(asc(memories.id)).all().filter(r => policy.eligible("memory", r.id)).slice(0, limit)
        .map(r => ({ ...MemoryRecordSchema.parse(r), provenance: this.links("memory", r.id) as Awaited<ReturnType<DiaryMemoryReadPort["listMemoryCandidates"]>>[number]["provenance"] }));
    },
  };
  notes: NotesPort = {
    list: async (userId) => {
      this.assertUser(userId);
      const repo = new MemoryRepository(this.lease);
      const notes = [];
      for (let cursor: string | undefined; ; ) {
        const page = repo.list(userId, { limit: 100, ...(cursor ? { cursor: cursor as never } : {}) });
        notes.push(...page.memories.map((m) => ({ content: m.content, accessLevel: m.accessLevel })));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return notes;
    },
    // An AI proposal (D38) approved in the same transaction (D49): the user excludes or deletes it afterwards.
    save: async (userId, sourceMessageId, contents) => {
      this.assertUser(userId);
      const repo = new MemoryRepository(this.lease);
      return this.lease.db.transaction(() => contents.map((content) => {
        const proposed = repo.create(userId, { origin: "ai_proposal", content, accessLevel: "ai_eligible",
          sources: [{ sourceType: "message", sourceId: sourceMessageId as never }] });
        const saved = repo.review(userId, proposed.id, { status: "approved" });
        return { id: saved.id, content: saved.content };
      }))();
    },
  };
  revocations: RevocationReportingPort = {
    listTombstonesSince: async ({ userId, since }) => {
      this.assertUser(userId);
      return this.lease.orm.select().from(tombstones).where(and(eq(tombstones.userId, userId),
        // Inclusive contract: at or after the cursor timestamp.
        gte(tombstones.deletedAt, since))).all() as Awaited<ReturnType<RevocationReportingPort["listTombstonesSince"]>>;
    },
  };
  private writeContext(input: Parameters<ConversationPersistencePort["recordMessageContext"]>[0]) {
    this.assertUser(input.userId);
    requireRow(this.lease.orm.select().from(messages).where(owner(messages, input.userId, input.messageId)).get());
    const table = input.sourceType === "diary_entry" ? diaryEntries : memories;
    requireRow(this.lease.orm.select({ id: table.id }).from(table).where(owner(table, input.userId, input.sourceId)).get());
    this.lease.orm.insert(messageContext).values(input).onConflictDoNothing().run();
    return input;
  }
  private links(type: "diary_entry" | "memory", id: string) {
    return this.lease.orm.select().from(provenance).where(and(eq(provenance.userId, this.userId), eq(provenance.derivedType, type), eq(provenance.derivedId, id))).all();
  }
}
