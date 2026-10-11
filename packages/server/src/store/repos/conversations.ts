import { and, asc, desc, eq } from "drizzle-orm";
import {
  ConversationCreateInputSchema, ConversationRecordSchema, ConversationUpdateInputSchema,
  MessageCreateInputSchema, MessageRecordSchema, type ConversationCreateInput,
  type ConversationUpdateInput, type MessageCreateInput, type UserId,
} from "@innercove/core";
import type { DatabaseLease } from "../db.js";
import { conversations, messages } from "../schema.js";
import { olderThan, owner, page, requireRow, timestamp, tombstone, uuidv7 } from "./common.js";

export class ConversationRepository {
  constructor(readonly lease: DatabaseLease) {}
  get(userId: UserId, id: string) {
    return ConversationRecordSchema.parse(requireRow(this.lease.orm.select().from(conversations).where(owner(conversations, userId, id)).get()));
  }
  list(userId: UserId, limit: number, cursor?: string) {
    const anchor = cursor ? this.get(userId, cursor) : undefined;
    const result = page(this.lease.orm.select().from(conversations)
      .where(and(eq(conversations.userId, userId), anchor ? olderThan(conversations, anchor) : undefined))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(limit + 1).all().map(r => ConversationRecordSchema.parse(r)), limit);
    return { conversations: result.rows, nextCursor: result.nextCursor };
  }
  create(userId: UserId, input: ConversationCreateInput) {
    const data = ConversationCreateInputSchema.parse(input);
    const now = timestamp();
    const record = ConversationRecordSchema.parse({ id: uuidv7(), userId, title: data.title ?? null, createdAt: now, updatedAt: now });
    this.lease.orm.insert(conversations).values(record).run();
    return record;
  }
  update(userId: UserId, id: string, input: ConversationUpdateInput) {
    const data = ConversationUpdateInputSchema.parse(input);
    this.get(userId, id);
    if (Object.keys(data).length) this.lease.orm.update(conversations).set({ ...data, updatedAt: timestamp() }).where(owner(conversations, userId, id)).run();
    return this.get(userId, id);
  }
  listMessages(userId: UserId, id: string, limit?: number) {
    this.get(userId, id);
    // The public bounded list returns the most recent messages, oldest first;
    // the history port reads all, allowing A's D33 filter to run before truncation.
    const query = this.lease.orm.select().from(messages).where(and(eq(messages.userId, userId), eq(messages.conversationId, id)));
    const rows = limit === undefined ? query.orderBy(asc(messages.createdAt), asc(messages.id)).all()
      : query.orderBy(desc(messages.createdAt), desc(messages.id)).limit(limit).all().reverse();
    return rows.map(r => MessageRecordSchema.parse(r));
  }
  appendMessage(userId: UserId, input: MessageCreateInput) {
    const data = MessageCreateInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      this.get(userId, data.conversationId);
      const last = this.lease.orm.select({ createdAt: messages.createdAt }).from(messages)
        .where(and(eq(messages.userId, userId), eq(messages.conversationId, data.conversationId)))
        .orderBy(desc(messages.createdAt)).limit(1).get();
      const now = new Date(Math.max(Date.now(), last ? Date.parse(last.createdAt) + 1 : 0)).toISOString();
      const record = MessageRecordSchema.parse({ ...data, id: uuidv7(), userId, createdAt: now });
      this.lease.orm.insert(messages).values(record).run();
      this.lease.orm.update(conversations).set({ updatedAt: now }).where(owner(conversations, userId, data.conversationId)).run();
      return record;
    })();
  }
  delete(userId: UserId, id: string) {
    return this.lease.db.transaction(() => {
      this.get(userId, id);
      for (const message of this.listMessages(userId, id)) tombstone(this.lease, userId, "message", message.id);
      this.lease.orm.delete(conversations).where(owner(conversations, userId, id)).run();
      return { tombstone: tombstone(this.lease, userId, "conversation", id) };
    })();
  }
}
