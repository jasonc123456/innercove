/**
 * SSE client for POST /api/infer (temporary chats, plan §3c). `EventSource`
 * can't POST, so this reads the stream with fetch. History stays in browser
 * memory only (D09/D35).
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

export interface StreamHandlers {
  onDelta: (text: string) => void;
  /** The output screen stopped the stream; replace the partial reply with this text. */
  onReplace?: (text: string) => void;
  onMeta?: (meta: ReplyMeta) => void;
  onDone?: (done: ReplyDone) => void;
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
  request: { message: string; history: ChatTurn[] },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/infer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      history: request.history.slice(-MAX_HISTORY),
      message: request.message,
    }),
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
