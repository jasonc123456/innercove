/**
 * Conversations and messages (chat), kept as a SEPARATE entity family
 * from diary entries (plan: "Separate chat and diary entities").
 *
 * Revised per §3c (supersedes this package's first draft): NO
 * `isTemporary` field anywhere. Temporary chats go through A's
 * stateless `POST /api/infer` (D35) and never reach these schemas, the
 * data layer, or the database at all -- there is no "temporary
 * conversation row" to guard against, so the first draft's literal-
 * narrowing `PersistableConversationInputSchema` trick is gone with it.
 * Every `ConversationRecord`/`MessageRecord` this package describes is,
 * by construction, a saved one.
 */
import { z } from "zod";
import { UserIdSchema, ConversationIdSchema, MessageIdSchema } from "./ids.js";

export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// ---------------------------------------------------------------- Conversation --
export const ConversationRecordSchema = z.object({
  id: ConversationIdSchema,
  userId: UserIdSchema,
  title: z.string().min(1).max(200).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;

/** Create input: no id/userId/timestamps from the client. `.strict()`
 * (§3c convention). */
export const ConversationCreateInputSchema = z
  .object({
    title: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
export type ConversationCreateInput = z.infer<typeof ConversationCreateInputSchema>;

/** Update input: every field optional, no `.default()` anywhere -- an
 * omitted key leaves the stored value untouched, never silently resets
 * it. `.strict()`. */
export const ConversationUpdateInputSchema = z
  .object({
    title: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
export type ConversationUpdateInput = z.infer<typeof ConversationUpdateInputSchema>;

// -------------------------------------------------------------------- Message --
export const MessageRecordSchema = z.object({
  id: MessageIdSchema,
  conversationId: ConversationIdSchema,
  userId: UserIdSchema,
  role: MessageRoleSchema,
  content: z.string().min(1),
  /** Added per §3c's data model ("messages: add `safetyTier` and
   * `modelId`"). `safetyTier` is D's tier function's output
   * (0/1/2, owned by D/A's pipeline); `modelId` is null for a user
   * message (no model produced it). */
  safetyTier: z.number().int().min(0).max(2).nullable(),
  modelId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type MessageRecord = z.infer<typeof MessageRecordSchema>;

/** Create input for a PERSISTED message (used by A's `/api/chat`
 * pipeline when it decides to save a turn -- never called for
 * `/api/infer`, which never writes at all). `conversationId` comes
 * from the URL path on the HTTP route (api/conversations.ts omits it
 * there); this is the underlying shape the data-layer port accepts.
 * `.strict()`. */
export const MessageCreateInputSchema = z
  .object({
    conversationId: ConversationIdSchema,
    role: MessageRoleSchema,
    content: z.string().min(1),
    safetyTier: z.number().int().min(0).max(2).nullable(),
    modelId: z.string().nullable(),
  })
  .strict();
export type MessageCreateInput = z.infer<typeof MessageCreateInputSchema>;
