/**
 * Chat routes (§3c, owned by role A): `POST /api/chat` for saved chats and
 * `POST /api/infer` for temporary chats (D35), plus the SSE events both send.
 */
import { z } from "zod";
import type { SafetyTier } from "../safety/types.js";
import { ConversationIdSchema, MemoryIdSchema } from "../types/ids.js";

export const ExerciseSuggestionIdSchema = z.enum(["breathing478", "comfortable-breathing"]);
export type ExerciseSuggestionId = z.infer<typeof ExerciseSuggestionIdSchema>;

/** Server-owned exercise destinations. The model can never supply a navigation URL. */
export const SuggestedExerciseSchema = z.object({
  id: ExerciseSuggestionIdSchema,
  title: z.string(),
  route: z.literal("/exercises/breathing"),
  reason: z.string(),
}).strict();
export type SuggestedExercise = z.infer<typeof SuggestedExerciseSchema>;

/** `POST /api/chat`. A `null` conversationId creates a saved conversation. */
export const ChatRequestSchema = z
  .object({
    conversationId: ConversationIdSchema.nullable(),
    message: z.string().trim().min(1).max(4000),
    useMemories: z.boolean(),
    pinnedMemoryIds: z.array(MemoryIdSchema).max(5),
    dismissedExerciseIds: z.array(ExerciseSuggestionIdSchema).max(2).default([]),
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
    dismissedExerciseIds: z.array(ExerciseSuggestionIdSchema).max(2).default([]),
  })
  .strict();
export type InferRequest = z.infer<typeof InferRequestSchema>;

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
  /** Optional, server-validated navigation suggestion; absent for safety tiers. */
  suggestedExercise: SuggestedExercise;
  delta: { text: string };
  replaced: { text: string; reason: "screen" };
  /** Saved chats only (D49): notes InnerCove just wrote from the user's message, already in use; the UI offers exclude/delete. */
  remembered: { items: { id: string; content: string }[] };
  done: { assistantMessageId: string | null; modelId: string; firstWordMs: number | null; tokPerS: number | null };
  error: { code: string; message: string };
}
