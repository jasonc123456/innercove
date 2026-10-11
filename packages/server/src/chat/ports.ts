import type {
  ConversationPersistencePort,
  DiaryMemoryReadPort,
  MessageContextReadPort,
  UserId,
} from "@innercove/core";

import type { ConversationHistoryPort } from "@innercove/core";
export type { ConversationHistoryPort } from "@innercove/core";

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
