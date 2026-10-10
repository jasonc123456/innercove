/**
 * Chat routes (§3c, owned by role A): `POST /api/chat` for saved chats and
 * `POST /api/infer` for temporary chats (D35), plus the SSE events both send.
 */
import { z } from "zod";
import { ConversationIdSchema, MemoryIdSchema } from "../types/ids.js";

/** `POST /api/chat`. A `null` conversationId creates a saved conversation. */
export const ChatRequestSchema = z
  .object({
    conversationId: ConversationIdSchema.nullable(),
    message: z.string().trim().min(1).max(4000),
    useMemories: z.boolean(),
    pinnedMemoryIds: z.array(MemoryIdSchema).max(5),
  })
  .strict();
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const InferHistoryMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(16000),
  })
  .strict();
export type InferHistoryMessage = z.infer<typeof InferHistoryMessageSchema>;

/** `POST /api/infer`. History is held in browser memory only (max 20 turns); never written (D35). */
export const InferRequestSchema = z
  .object({
    history: z.array(InferHistoryMessageSchema).max(40),
    message: z.string().trim().min(1).max(4000),
    useMemories: z.boolean().default(false),
    pinnedMemoryIds: z.array(MemoryIdSchema).max(5).default([]),
  })
  .strict();
export type InferRequest = z.infer<typeof InferRequestSchema>;

export type SafetyTier = 0 | 1 | 2;

export interface ChatContextSource {
  type: "diary_entry" | "memory";
  id: string;
  title: string;
}

/** SSE events for both routes, in send order (§3c). */
export interface ChatEvents {
  meta: { conversationId: string | null; userMessageId: string | null; tier: SafetyTier };
  context: { sources: ChatContextSource[]; sent: { id: string; text: string }[] };
  historyExcluded: { count: number };
  delta: { text: string };
  replaced: { text: string; reason: "screen" };
  done: { assistantMessageId: string | null; modelId: string; firstWordMs: number | null; tokPerS: number | null };
  error: { code: string; message: string };
}
