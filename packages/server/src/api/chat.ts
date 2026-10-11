import {
  ChatRequestSchema,
  InferRequestSchema,
  type ConversationId,
  type DiaryEntryId,
  type MemoryId,
  type MessageRecord,
} from "@innercove/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../app.js";
import { filterHistory } from "../chat/history.js";
import { NotFoundError, type ChatStore } from "../chat/ports.js";
import { eligibleIds, loadEligiblePool, selectContext, usedContext } from "../chat/retrieval.js";
import { writeNotes } from "../chat/remember.js";
import { runTurn, type TurnHooks } from "../chat/turn.js";
import { suggestExercise } from "../chat/exercise-suggestion.js";
import { sendError, validationDetails } from "./errors.js";
import { SqlChatStore } from "../store/chat-store.js";
import { openSse } from "./sse.js";

export function chatRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Saved chats: history from the store with D33 applied; both sides of the turn are persisted. */
  app.post("/api/chat", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid chat request", validationDetails(parsed.error));
    const { conversationId, message, useMemories, pinnedMemoryIds, dismissedExerciseIds } = parsed.data;
    const store = deps.store ?? new SqlChatStore(request.databaseLease!);

    let prior: MessageRecord[] = [];
    if (conversationId !== null) {
      try {
        prior = await store.history.listMessages({ userId: store.userId, conversationId });
      } catch (error) {
        if (error instanceof NotFoundError) return sendError(reply, "NOT_FOUND", "Conversation not found");
        throw error;
      }
    }
    const hooks = savedChatHooks(store, conversationId, prior, message, useMemories, pinnedMemoryIds, dismissedExerciseIds, deps);
    return stream(request, reply, deps, message, hooks);
  });

  /** Temporary chats (D35): history comes from the browser; never writes rows or content logs. */
  app.post("/api/infer", async (request, reply) => {
    const parsed = InferRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid infer request", validationDetails(parsed.error));
    const { history, message, useMemories, pinnedMemoryIds, dismissedExerciseIds } = parsed.data;
    const store = deps.store ?? new SqlChatStore(request.databaseLease!);
    return stream(request, reply, deps, message, {
      prepare: async () => ({
        history,
        context:
          useMemories && store
            ? selectContext(await loadEligiblePool(store.reads, store.userId), message, pinnedMemoryIds)
            : [],
        historyExcluded: 0,
      }),
      suggestExercise: (tier) => suggestExercise({
        message,
        safetyTier: tier,
        dismissedIds: dismissedExerciseIds,
        // InferRequestSchema permits only user/assistant roles; preserve that
        // narrower contract for the suggestion policy.
        recentHistory: history.map(({ role, content }) => ({ role: role as "user" | "assistant", content })),
      }),
    });
  });
}

function savedChatHooks(
  store: ChatStore,
  existingId: ConversationId | null,
  prior: MessageRecord[],
  message: string,
  useMemories: boolean,
  pinnedMemoryIds: readonly string[],
  dismissedExerciseIds: readonly ("breathing478" | "comfortable-breathing")[],
  deps: Pick<AppDeps, "provider" | "safety" | "rememberNotes">,
): TurnHooks {
  const userId = store.userId;
  let conversationId = existingId;
  let userMessageId: string | null = null;
  return {
    start: async (tier) => {
      conversationId ??= (await store.persistence.saveConversation({ userId, title: null })).id;
      const user = await store.persistence.appendMessage({
        userId,
        conversationId,
        role: "user",
        content: message,
        safetyTier: tier,
        modelId: null,
      });
      userMessageId = user.id;
      return { conversationId, userMessageId: user.id };
    },
    prepare: async () => {
      const replyIds = prior.filter((m) => m.role === "assistant").map((m) => m.id);
      const contexts = replyIds.length
        ? await store.contexts.listContextForMessages({ userId, messageIds: replyIds })
        : [];
      const needPool = useMemories || contexts.length > 0;
      const pool = needPool ? await loadEligiblePool(store.reads, userId) : { memories: [], diaryEntries: [] };
      const { history, excludedCount } = filterHistory(prior, contexts, eligibleIds(pool));
      return {
        history,
        context: useMemories ? selectContext(pool, message, pinnedMemoryIds) : [],
        historyExcluded: excludedCount,
      };
    },
    finish: async ({ text, modelId, tier, context: sent }) => {
      // Everything eligible is sent (D49); record only what this exchange drew on, so D33 stays targeted.
      const context = usedContext(sent, text);
      if (store.persistence.appendMessageWithContext) {
        const saved = await store.persistence.appendMessageWithContext({
          userId, conversationId: conversationId!, role: "assistant", content: text, safetyTier: tier, modelId,
        }, context.map(item => item.type === "memory"
          ? { sourceType: "memory", sourceId: item.id as MemoryId }
          : { sourceType: "diary_entry", sourceId: item.id as DiaryEntryId }));
        return saved.id;
      }
      const saved = await store.persistence.appendMessage({
        userId,
        conversationId: conversationId!,
        role: "assistant",
        content: text,
        safetyTier: tier,
        modelId,
      });
      for (const item of context) {
        await store.persistence.recordMessageContext(
          item.type === "memory"
            ? { userId, messageId: saved.id, sourceType: "memory", sourceId: item.id as MemoryId }
            : { userId, messageId: saved.id, sourceType: "diary_entry", sourceId: item.id as DiaryEntryId },
        );
      }
      return saved.id;
    },
    remember: async (signal) => {
      if (!deps.rememberNotes || !store.notes || !userMessageId) return [];
      const notes = await writeNotes({
        provider: deps.provider,
        safety: deps.safety,
        message,
        existing: await store.notes.list(userId),
        signal,
      });
      return notes.length ? store.notes.save(userId, userMessageId, notes) : [];
    },
    suggestExercise: (tier) => suggestExercise({
      message,
      safetyTier: tier,
      dismissedIds: dismissedExerciseIds,
      recentHistory: prior
        .filter((item): item is typeof item & { role: "user" | "assistant" } => item.role === "user" || item.role === "assistant")
        .map(({ role, content }) => ({ role, content })),
    }),
  };
}

async function stream(request: FastifyRequest, reply: FastifyReply, deps: AppDeps, message: string, hooks: TurnHooks) {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  reply.hijack();
  const send = openSse(reply.raw);
  try {
    const stats = await runTurn({
      provider: deps.provider,
      safety: deps.safety,
      systemPrompt: deps.systemPrompt,
      message,
      signal: controller.signal,
      send,
      hooks,
      onScreenBlock: (tier, reasons) =>
        request.log.info({ event: "output_screened", tier, reasons }, "output screen blocked a reply"),
    });
    // Screened or empty replies have no speed; keep the last full measurement.
    if (stats?.firstWordMs != null && stats.tokPerS != null) {
      deps.stats.lastReply = { firstWordMs: stats.firstWordMs, tokPerS: stats.tokPerS };
    }
    if (controller.signal.aborted) request.log.info("chat stream aborted by client");
  } catch (error) {
    // Store failures after the stream opened: report without echoing content.
    request.log.error({ err: { name: (error as Error).name } }, "chat turn failed");
    send("error", { code: "INTERNAL_ERROR", message: "Something went wrong saving this chat." });
  } finally {
    reply.raw.end();
  }
}
