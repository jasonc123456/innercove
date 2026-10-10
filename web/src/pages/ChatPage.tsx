import { useEffect, useRef, useState } from "react";
import { streamAssistantReply } from "../chat/streamReply";
import { MessageInput } from "../components/MessageInput";
import { MessageList, type ChatMessage } from "../components/MessageList";

export function ChatPage() {
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
