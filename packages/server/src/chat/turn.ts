import type { SafetyTier } from "@innercove/core";
import {
  ModelUnavailableError,
  type ChatMessage,
  type InferenceProvider,
} from "../inference/index.js";
import type { SendEvent } from "../api/sse.js";
import { assemblePrompt, contextEvent } from "./prompt.js";
import type { ContextItem } from "./retrieval.js";
import { SAFE_FALLBACK, SentenceGate, type SafetyLayer } from "./safety.js";

export interface ReplyStats {
  firstWordMs: number | null;
  tokPerS: number | null;
}

/** History and context for one turn (plan §3 steps 2-3). */
export interface PreparedTurn {
  history: ChatMessage[];
  context: ContextItem[];
  /** Earlier exchanges dropped by D33. */
  historyExcluded: number;
}

export interface TurnHooks {
  /** After the pre-screen. Saved chats create the conversation and save the user message here. */
  start?(tier: SafetyTier): Promise<{ conversationId: string | null; userMessageId: string | null }>;
  /** Retrieval and history; only called below tier 2. */
  prepare?(): Promise<PreparedTurn>;
  /** After the reply is complete and screened. Returns the saved assistant message id, if any. */
  finish?(reply: { text: string; modelId: string; tier: SafetyTier; context: ContextItem[] }): Promise<string | null>;
}

export interface TurnInput {
  provider: InferenceProvider;
  safety: SafetyLayer;
  systemPrompt: string;
  message: string;
  signal: AbortSignal;
  send: SendEvent;
  hooks?: TurnHooks;
  /** Called with the screen's reasons only, never the text (plan §3 step 5). */
  onScreenBlock?: (tier: number, reasons: readonly string[]) => void;
}

export const REVIEWED_REPLY_MODEL_ID = "reviewed-reply";

/**
 * One chat turn (plan §3 "Chat turn pipeline"): pre-screen, retrieve and
 * assemble the prompt, then generate and screen by tier so nothing reaches
 * the client before the output screen passes it (D32), then persist.
 */
export async function runTurn(input: TurnInput): Promise<ReplyStats | null> {
  const { provider, safety, send, signal, hooks = {} } = input;
  const assessment = safety.assess(input.message);
  const tier = assessment.tier;
  const ids = (await hooks.start?.(tier)) ?? { conversationId: null, userMessageId: null };
  send("meta", { ...ids, tier });

  if (tier === 2) {
    const text = safety.tier2Reply(assessment);
    send("context", { sources: [], sent: [] });
    send("delta", { text });
    const assistantMessageId = (await hooks.finish?.({ text, modelId: REVIEWED_REPLY_MODEL_ID, tier, context: [] })) ?? null;
    send("done", { assistantMessageId, modelId: REVIEWED_REPLY_MODEL_ID, firstWordMs: null, tokPerS: null });
    return null;
  }

  const prepared = (await hooks.prepare?.()) ?? { history: [], context: [], historyExcluded: 0 };
  send("context", contextEvent(prepared.context));
  if (prepared.historyExcluded > 0) send("historyExcluded", { count: prepared.historyExcluded });

  const messages = assemblePrompt({
    systemPrompt: input.systemPrompt,
    context: prepared.context,
    history: prepared.history,
    message: input.message,
  });

  const generation = new AbortController();
  const stopGeneration = () => generation.abort();
  signal.addEventListener("abort", stopGeneration, { once: true });

  const start = performance.now();
  let firstWordAt: number | null = null;
  let firstTokenAt: number | null = null;
  let tokens = 0;
  let released = "";
  let replacement: string | null = null;

  /** Screens everything released so far plus `text`; sends it only if the screen passes. */
  const release = (text: string): boolean => {
    if (!text) return true;
    const verdict = safety.screen(released + text);
    if (!verdict.allowed) {
      replacement = verdict.replacementText ?? SAFE_FALLBACK;
      input.onScreenBlock?.(tier, verdict.reasons);
      send("replaced", { text: replacement, reason: "screen" });
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
    if (replacement === null) release(tier === 1 ? full : gate.flush());
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
  // Aborted by the client: the user message stays saved, the partial reply is discarded (§3c).
  if (signal.aborted) return null;

  const end = performance.now();
  const stats: ReplyStats = {
    firstWordMs: firstWordAt === null ? null : Math.round(firstWordAt - start),
    tokPerS:
      firstTokenAt === null || tokens === 0 || replacement !== null
        ? null
        : round1(tokens / Math.max((end - firstTokenAt) / 1000, 0.001)),
  };
  const shown = replacement ?? released;
  const assistantMessageId = shown
    ? ((await hooks.finish?.({ text: shown, modelId: provider.modelId, tier, context: prepared.context })) ?? null)
    : null;
  send("done", { assistantMessageId, modelId: provider.modelId, ...stats });
  return stats;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
