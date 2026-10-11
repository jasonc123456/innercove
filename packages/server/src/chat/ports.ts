import type {
  ConversationPersistencePort,
  DiaryMemoryReadPort,
  MessageContextReadPort,
  UserId,
} from "@innercove/core";

import type { ConversationHistoryPort } from "@innercove/core";
import type { ExistingNote } from "./remember.js";
export type { ConversationHistoryPort } from "@innercove/core";

/** D49: the memories InnerCove writes itself. A note is linked to the user message it came from (D16). */
export interface NotesPort {
  /** Every memory, including ones the user excluded (used only to avoid re-adding them). */
  list(userId: UserId): Promise<ExistingNote[]>;
  /** Saves notes as approved AI memories the model may use, linked to `sourceMessageId`. */
  save(userId: UserId, sourceMessageId: string, contents: readonly string[]): Promise<{ id: string; content: string }[]>;
}

/** Everything the chat pipeline reads and writes, all scoped to one user. Implemented by B's store. */
export interface ChatStore {
  userId: UserId;
  reads: DiaryMemoryReadPort;
  contexts: MessageContextReadPort;
  history: ConversationHistoryPort;
  persistence: ConversationPersistencePort;
  /** Optional: stores without it never write notes. */
  notes?: NotesPort;
}

/** Thrown by stores for a missing or foreign conversation; mapped to 404 NOT_FOUND. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
}
