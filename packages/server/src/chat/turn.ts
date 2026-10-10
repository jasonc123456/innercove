import {
  ModelUnavailableError,
  type ChatMessage,
  type InferenceProvider,
} from "../inference/index.js";
import type { SendEvent } from "../api/sse.js";
import { SAFE_FALLBACK, SentenceGate, type SafetyLayer } from "./safety.js";

export interface ReplyStats {
  firstWordMs: number | null;
  tokPerS: number | null;
}

export interface TurnInput {
  provider: InferenceProvider;
  safety: SafetyLayer;
  systemPrompt: string;
  history: ChatMessage[];
  message: string;
  signal: AbortSignal;
  send: SendEvent;
  conversationId?: string | null;
  /** Called with the screen's reasons only, never the text (plan §3 step 5). */
  onScreenBlock?: (tier: number, reasons: string[]) => void;
}

export const REVIEWED_REPLY_MODEL_ID = "reviewed-reply";

/**
 * One chat turn (plan §3 "Chat turn pipeline"): pre-screen, then generate and
 * screen by tier so nothing reaches the client before the output screen passes
 * it (D32). Memories (step 2) and persistence (step 7) come in Phases 2-3.
 */
export async function runTurn(input: TurnInput): Promise<ReplyStats | null> {
  const { provider, safety, send, signal } = input;
  const assessment = safety.assess(input.message);
  const tier = assessment.tier;
  send("meta", { conversationId: input.conversationId ?? null, userMessageId: null, tier });
  send("context", { sources: [], sent: [] });

  if (tier === 2) {
    send("delta", { text: safety.tier2Reply(assessment) });
    send("done", { assistantMessageId: null, modelId: REVIEWED_REPLY_MODEL_ID, firstWordMs: null, tokPerS: null });
    return null;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.history,
    { role: "user", content: input.message },
  ];

  const generation = new AbortController();
  const stopGeneration = () => generation.abort();
  signal.addEventListener("abort", stopGeneration, { once: true });

  const start = performance.now();
  let firstWordAt: number | null = null;
  let firstTokenAt: number | null = null;
  let tokens = 0;
  let released = "";
  let blocked = false;

  /** Screens everything released so far plus `text`; sends it only if the screen passes. */
  const release = (text: string): boolean => {
    if (!text) return true;
    const verdict = safety.screen(released + text);
    if (!verdict.allowed) {
      blocked = true;
      input.onScreenBlock?.(tier, verdict.reasons);
      send("replaced", { text: verdict.replacementText ?? SAFE_FALLBACK, reason: "screen" });
      return false;
    }
    released += text;
    firstWordAt ??= performance.now();
    send("delta", { text });
    return true;
  };

  const gate = new SentenceGate();
  let full = "";
  try {
    for await (const event of provider.streamChat(messages, { signal: generation.signal })) {
      if (event.type === "usage") {
        tokens = event.completionTokens;
        continue;
      }
      firstTokenAt ??= performance.now();
      if (tier === 1) {
        full += event.text;
        continue;
      }
      if (!gate.push(event.text).every(release)) break;
    }
    if (!blocked) release(tier === 1 ? full : gate.flush());
  } catch (error) {
    if (signal.aborted) return null;
    const unavailable = error instanceof ModelUnavailableError;
    send("error", {
      code: unavailable ? "MODEL_UNAVAILABLE" : "INTERNAL_ERROR",
      message: unavailable ? "The model isn't available right now." : "Something went wrong generating a reply.",
    });
    return null;
  } finally {
    signal.removeEventListener("abort", stopGeneration);
    generation.abort();
  }
  if (signal.aborted) return null;

  const end = performance.now();
  const stats: ReplyStats = {
    firstWordMs: firstWordAt === null ? null : Math.round(firstWordAt - start),
    tokPerS:
      firstTokenAt === null || tokens === 0 || blocked
        ? null
        : round1(tokens / Math.max((end - firstTokenAt) / 1000, 0.001)),
  };
  send("done", { assistantMessageId: null, modelId: provider.modelId, ...stats });
  return stats;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
