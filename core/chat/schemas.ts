import { z } from "zod";

/** Request and SSE contracts for /api/chat and /api/infer (plan §3c, owner A). */

const Id = z.uuid();

export const ChatRequest = z.strictObject({
  conversationId: Id.nullable(),
  message: z.string().trim().min(1).max(4000),
  useMemories: z.boolean(),
  pinnedMemoryIds: z.array(Id).max(5),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const HistoryMessage = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(16000),
});

export const InferRequest = z.strictObject({
  /** Max 20 turns (user + assistant), held in browser memory only. */
  history: z.array(HistoryMessage).max(40),
  message: z.string().trim().min(1).max(4000),
  useMemories: z.boolean().default(false),
  pinnedMemoryIds: z.array(Id).max(5).default([]),
});
export type InferRequest = z.infer<typeof InferRequest>;

export type SafetyTier = 0 | 1 | 2;

export interface ContextSource {
  type: "diary_entry" | "memory";
  id: string;
  title: string;
}

/** SSE events in send order. */
export interface ChatEvents {
  meta: { conversationId: string | null; userMessageId: string | null; tier: SafetyTier };
  context: { sources: ContextSource[]; sent: { id: string; text: string }[] };
  historyExcluded: { count: number };
  delta: { text: string };
  replaced: { text: string; reason: "screen" };
  done: { assistantMessageId: string | null; modelId: string; firstWordMs: number | null; tokPerS: number | null };
  error: { code: string; message: string };
}
