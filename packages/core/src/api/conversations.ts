/**
 * /api/conversations (§3c). Note what's NOT here: there is no public
 * `POST .../messages` -- §3c's route table lists only `GET
 * /api/conversations/:id/messages`. A message is only ever created as
 * a side effect of A's `POST /api/chat` (which calls
 * `ConversationPersistencePort.appendMessage`, data-layer/index.ts),
 * never through a B-owned HTTP create route.
 */
import { z } from "zod";
import { ConversationIdSchema } from "../types/ids.js";
import { ConversationRecordSchema, ConversationCreateInputSchema, ConversationUpdateInputSchema, MessageRecordSchema } from "../types/conversation.js";
import { TombstoneRecordSchema } from "../types/tombstone.js";

// GET /api/conversations
export const ListConversationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: ConversationIdSchema.optional(),
  })
  .strict();
export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;

export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationRecordSchema),
  nextCursor: ConversationIdSchema.nullable(),
});
export type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;

// GET /api/conversations/:id
export const GetConversationResponseSchema = ConversationRecordSchema;
export type GetConversationResponse = z.infer<typeof GetConversationResponseSchema>;

// POST /api/conversations
export const CreateConversationRequestSchema = ConversationCreateInputSchema;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export const CreateConversationResponseSchema = ConversationRecordSchema;
export type CreateConversationResponse = z.infer<typeof CreateConversationResponseSchema>;

// PATCH /api/conversations/:id
export const UpdateConversationRequestSchema = ConversationUpdateInputSchema;
export type UpdateConversationRequest = z.infer<typeof UpdateConversationRequestSchema>;
export const UpdateConversationResponseSchema = ConversationRecordSchema;
export type UpdateConversationResponse = z.infer<typeof UpdateConversationResponseSchema>;

// DELETE /api/conversations/:id -> a content-free tombstone, never the
// deleted conversation's own content.
export const DeleteConversationResponseSchema = z.object({
  tombstone: TombstoneRecordSchema,
});
export type DeleteConversationResponse = z.infer<typeof DeleteConversationResponseSchema>;

// GET /api/conversations/:id/messages (the only message route B owns)
export const ListMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export const ListMessagesResponseSchema = z.object({
  messages: z.array(MessageRecordSchema),
});
export type ListMessagesResponse = z.infer<typeof ListMessagesResponseSchema>;
