import { useEffect, useRef, useState } from "react";
import { streamAssistantReply } from "../chat/streamReply";
import { MessageInput } from "../components/MessageInput";
import { MessageList, type ChatMessage } from "../components/MessageList";
import { useAppSession } from "../session/AppSession";

export function ChatPage() {
  const { chatMode, useMemories, setChatMode, setUseMemories } = useAppSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleSend(text: string) {
    if (streamingId !== null) {
      return;
    }

    setFailed(false);
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setStreamingId(assistantId);

    const controller = new AbortController();
    abortRef.current = controller;

    const history = messages
      .filter((message) => message.content !== "")
      .map(({ role, content }) => ({ role, content }));
    const setReply = (update: (content: string) => string) =>
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: update(message.content) }
            : message,
        ),
      );

    try {
      await streamAssistantReply(
        { message: text, history },
        {
          onDelta: (chunk) => setReply((content) => content + chunk),
          onReplace: (replacement) => setReply(() => replacement),
        },
        controller.signal,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setFailed(true);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setStreamingId((current) => (current === assistantId ? null : current));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-4 py-3">
        <div className="flex gap-2" role="group" aria-label="Save or temporary">
          <button
            type="button"
            aria-pressed={chatMode === "temporary"}
            onClick={() => setChatMode("temporary")}
            className={
              chatMode === "temporary"
                ? "inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
                : "inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
            }
          >
            Temporary
          </button>
          <button
            type="button"
            aria-pressed={chatMode === "saved"}
            onClick={() => setChatMode("saved")}
            className={
              chatMode === "saved"
                ? "inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
                : "inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
            }
          >
            Save
          </button>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-base text-ink">
          <input
            type="checkbox"
            checked={useMemories}
            onChange={(event) => setUseMemories(event.target.checked)}
            className="size-5"
          />
          Use memories
        </label>
        {chatMode === "saved" ? (
          <p className="text-sm text-ink/70">
            Not saved. The conversation is not written to a database.
          </p>
        ) : null}
        {useMemories ? (
          <p className="text-sm text-ink/70">Memories are not connected.</p>
        ) : null}
      </div>
      <MessageList messages={messages} streamingId={streamingId} />
      {failed ? (
        <p className="px-4 pb-2 text-sm text-ink/70" role="status">
          The reply stopped. Try sending again.
        </p>
      ) : null}
      <MessageInput disabled={streamingId !== null} onSend={handleSend} />
    </div>
  );
}
