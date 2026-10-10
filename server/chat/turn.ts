import {
  ModelUnavailableError,
  type ChatMessage,
  type InferenceProvider,
} from "../../core/inference/index.js";
import type { SendEvent } from "../sse.js";

export interface ReplyStats {
  firstWordMs: number | null;
  tokPerS: number | null;
}

export interface TurnInput {
  provider: InferenceProvider;
  systemPrompt: string;
  history: ChatMessage[];
  message: string;
  signal: AbortSignal;
  send: SendEvent;
  conversationId?: string | null;
}

/**
 * One chat turn, Phase 1: no safety tiering, memories or persistence yet.
 * Later phases slot in the pre-screen (step 1), context (step 2) and the
 * screen-before-display stream (step 4, D32) without changing the event order.
 */
export async function runTurn(input: TurnInput): Promise<ReplyStats | null> {
  const { provider, send, signal } = input;
  send("meta", { conversationId: input.conversationId ?? null, userMessageId: null, tier: 0 });
  send("context", { sources: [], sent: [] });

  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.history,
    { role: "user", content: input.message },
  ];

  const start = performance.now();
  let firstWordAt: number | null = null;
  let tokens = 0;
  try {
    for await (const event of provider.streamChat(messages, { signal })) {
      if (event.type === "usage") {
        tokens = event.completionTokens;
        continue;
      }
      firstWordAt ??= performance.now();
      send("delta", { text: event.text });
    }
  } catch (error) {
    if (signal.aborted) return null;
    const unavailable = error instanceof ModelUnavailableError;
    send("error", {
      code: unavailable ? "MODEL_UNAVAILABLE" : "INTERNAL_ERROR",
      message: unavailable ? "The model isn't available right now." : "Something went wrong generating a reply.",
    });
    return null;
  }

  const end = performance.now();
  const stats: ReplyStats = {
    firstWordMs: firstWordAt === null ? null : Math.round(firstWordAt - start),
    tokPerS: firstWordAt === null || tokens === 0 ? null : round1(tokens / Math.max((end - firstWordAt) / 1000, 0.001)),
  };
  send("done", { assistantMessageId: null, modelId: provider.modelId, ...stats });
  return stats;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
