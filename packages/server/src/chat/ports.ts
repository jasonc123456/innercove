import type {
  ConversationId,
  ConversationPersistencePort,
  DiaryMemoryReadPort,
  MessageContextReadPort,
  MessageRecord,
  UserId,
} from "@innercove/core";

/**
 * Needed by A's D33 history policy for saved chats; not yet in
 * `packages/core/src/data-layer` (ask B to add it there). Returns the
 * conversation's messages oldest first; throws a NOT_FOUND-shaped error if the
 * conversation doesn't exist or belongs to another user.
 */
export interface ConversationHistoryPort {
  listMessages(params: { userId: UserId; conversationId: ConversationId }): Promise<MessageRecord[]>;
}

/** Everything the chat pipeline reads and writes, all scoped to one user. Implemented by B's store. */
export interface ChatStore {
  userId: UserId;
  reads: DiaryMemoryReadPort;
  contexts: MessageContextReadPort;
  history: ConversationHistoryPort;
  persistence: ConversationPersistencePort;
}

/** Thrown by stores for a missing or foreign conversation; mapped to 404 NOT_FOUND. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
}
