import { useEffect, useRef } from "react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type MessageListProps = {
  messages: ChatMessage[];
  streamingId: string | null;
};

export function MessageList({ messages, streamingId }: MessageListProps) {
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center px-4">
        <p className="text-base leading-relaxed text-ink/75">
          This chat stays in this tab until you leave or reload.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isStreaming = message.id === streamingId;

        return (
          <li
            key={message.id}
            aria-live={isStreaming ? "polite" : undefined}
            className={
              isUser
                ? "ml-8 rounded-2xl bg-cove px-4 py-3 text-base leading-relaxed text-white"
                : "mr-8 rounded-2xl bg-foam px-4 py-3 text-base leading-relaxed text-ink"
            }
          >
            <span className="sr-only">
              {isUser ? "You" : "InnerCove"}
              {": "}
            </span>
            {message.content}
            {isStreaming && message.content.length === 0 ? (
              <span className="text-ink/50">…</span>
            ) : null}
          </li>
        );
      })}
      <li ref={endRef} aria-hidden="true" className="h-px shrink-0" />
    </ol>
  );
}
