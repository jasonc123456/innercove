/**
 * SSE client for the chat routes (plan §3c). `EventSource` can't POST, so this
 * reads the stream with fetch.
 * - Temporary chats: POST /api/infer. History stays in browser memory only (D09/D35).
 * - Saved chats: POST /api/chat. The hub stores both messages in the encrypted DB and
 *   loads the history itself (with D33 applied), so no history is sent.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ReplyMeta {
  conversationId: string | null;
  userMessageId: string | null;
  tier: 0 | 1 | 2;
}

export interface ReplyDone {
  assistantMessageId: string | null;
  modelId: string;
  firstWordMs: number | null;
  tokPerS: number | null;
}

export interface SuggestedExercise {
  id: "breathing478" | "comfortable-breathing";
  title: string;
  route: "/exercises/breathing";
  reason: string;
}

/** SSE `context` event: chips and the exact text that was sent (§3c). */
export interface ReplyContext {
  sources: { type: "diary_entry" | "memory"; id: string; title: string }[];
  sent: { id: string; text: string }[];
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  /** The output screen stopped the stream; replace the partial reply with this text. */
  onReplace?: (text: string) => void;
  onMeta?: (meta: ReplyMeta) => void;
  onDone?: (done: ReplyDone) => void;
  onContext?: (context: ReplyContext) => void;
  /** Present only when the server dropped earlier exchanges (D33). */
  onHistoryExcluded?: (count: number) => void;
  onSuggestedExercise?: (suggestion: SuggestedExercise) => void;
}

export class ReplyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_HISTORY = 40; // 20 turns

export async function streamAssistantReply(
  request: {
    message: string;
    history: ChatTurn[];
    useMemories?: boolean;
    pinnedMemoryIds?: string[];
    dismissedExerciseIds?: ("breathing478" | "comfortable-breathing")[];
    /** Present for saved chats: `null` starts a new conversation (its id arrives in `onMeta`). */
    saved?: { conversationId: string | null };
  },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const pinnedMemoryIds = (request.pinnedMemoryIds ?? []).slice(0, 5);
  const res = await fetch(request.saved ? "/api/chat" : "/api/infer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      request.saved
        ? {
            conversationId: request.saved.conversationId,
            message: request.message,
            useMemories: request.useMemories ?? true,
            pinnedMemoryIds,
            dismissedExerciseIds: request.dismissedExerciseIds ?? [],
          }
        : {
            history: request.history.slice(-MAX_HISTORY),
            message: request.message,
            useMemories: request.useMemories ?? false,
            pinnedMemoryIds,
            dismissedExerciseIds: request.dismissedExerciseIds ?? [],
          },
    ),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new ReplyError(body?.error?.code ?? "INTERNAL_ERROR", body?.error?.message ?? `HTTP ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      dispatch(buffer.slice(0, end), handlers);
      buffer = buffer.slice(end + 2);
    }
  }
}

function dispatch(block: string, handlers: StreamHandlers) {
  let name = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) name = line.slice(7);
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!data) return;
  const payload = JSON.parse(data);
  switch (name) {
    case "meta":
      handlers.onMeta?.(payload);
      break;
    case "context":
      handlers.onContext?.(payload);
      break;
    case "historyExcluded":
      handlers.onHistoryExcluded?.(payload.count);
      break;
    case "suggestedExercise":
      handlers.onSuggestedExercise?.(payload);
      break;
    case "delta":
      handlers.onDelta(payload.text);
      break;
    case "replaced":
      handlers.onReplace?.(payload.text);
      break;
    case "done":
      handlers.onDone?.(payload);
      break;
    case "error":
      throw new ReplyError(payload.code, payload.message);
  }
}
