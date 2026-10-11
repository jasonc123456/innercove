import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { ReplyContext } from "../chat/streamReply";
import { CrisisCard } from "./CrisisCard";
import { ExerciseSuggestionCard, type ExerciseSuggestion } from "./ExerciseSuggestionCard";
import { useAppSession } from "../session/AppSession";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: ReplyContext;
  historyExcluded?: number;
  tier?: 0 | 1 | 2;
  suggestedExercise?: ExerciseSuggestion;
};

type MessageListProps = {
  messages: ChatMessage[];
  streamingId: string | null;
  openSource: { messageId: string; sourceId: string } | null;
  onOpenSource: (messageId: string, sourceId: string) => void;
  onCloseSource: () => void;
  onDismissExercise: (id: ExerciseSuggestion["id"]) => void;
};

export function MessageList({
  messages,
  streamingId,
  openSource,
  onOpenSource,
  onCloseSource,
  onDismissExercise,
}: MessageListProps) {
  const { chatMode } = useAppSession();
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center page-x px-4">
        <p className="text-base leading-relaxed text-ink/75">
          {chatMode === "saved"
            ? "This chat will be saved encrypted on your hub."
            : "This chat stays in this tab until you leave or reload."}
        </p>
      </div>
    );
  }

  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto page-x px-4 py-4">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isStreaming = message.id === streamingId;

        return (
          <li
            key={message.id}
            aria-live={isStreaming ? "polite" : undefined}
            className={
              isUser
                ? "ml-8 rounded-2xl bg-cove px-4 py-3 text-base leading-relaxed break-words text-white"
                : "mr-8 rounded-2xl bg-foam px-4 py-3 text-base leading-relaxed break-words text-ink"
            }
          >
            <span className="sr-only">
              {isUser ? "You" : "InnerCove"}
              {": "}
            </span>
            {message.content}
            {isStreaming && message.content.length === 0 ? (
              <span className="text-ink/50">
                {message.tier !== undefined && message.tier >= 1 ? "thinking…" : "…"}
              </span>
            ) : null}
            {!isUser && message.tier !== undefined && message.tier >= 1 ? (
              <CrisisCard />
            ) : null}
            {!isUser && message.suggestedExercise && message.tier === 0 ? (
              <ExerciseSuggestionCard suggestion={message.suggestedExercise} onDismiss={onDismissExercise} />
            ) : null}
            {!isUser && message.historyExcluded && message.historyExcluded > 0 ? (
              <p className="mt-3 text-sm leading-snug text-ink/80" role="status">
                The server left {message.historyExcluded} earlier{" "}
                {message.historyExcluded === 1 ? "exchange" : "exchanges"} out of
                this reply.
              </p>
            ) : null}
            {!isUser && message.context && message.context.sources.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-sm text-ink/70">Had access to</p>
                <div className="flex flex-wrap gap-2">
                  {message.context.sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      aria-pressed={
                        openSource?.messageId === message.id &&
                        openSource.sourceId === source.id
                      }
                      onClick={() => onOpenSource(message.id, source.id)}
                      className="inline-flex min-h-11 items-center rounded-2xl border border-line bg-paper px-3 text-sm text-cove"
                    >
                      {source.type === "memory" ? "Memory" : "Diary"}
                      {source.title ? ` · ${source.title}` : ""}
                    </button>
                  ))}
                </div>
                {openSource?.messageId === message.id ? (
                  <SentPanel
                    context={message.context}
                    sourceId={openSource.sourceId}
                    onClose={onCloseSource}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
      <li ref={endRef} aria-hidden="true" className="h-px shrink-0" />
    </ol>
  );
}

function SentPanel({
  context,
  sourceId,
  onClose,
}: {
  context: ReplyContext;
  sourceId: string;
  onClose: () => void;
}) {
  const source = context.sources.find((item) => item.id === sourceId);
  const sent = context.sent.find((item) => item.id === sourceId);
  if (!source) {
    return null;
  }
  const href =
    source.type === "memory"
      ? `/memories?id=${source.id}`
      : `/diary?id=${source.id}`;

  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">What was sent</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center px-2 text-sm text-cove"
        >
          Close
        </button>
      </div>
      <p className="mt-2 text-base leading-relaxed text-ink">
        {sent ? sent.text : "The reply did not include the text for this item."}
      </p>
      <Link
        to={href}
        className="mt-3 inline-flex h-11 items-center text-base text-cove"
      >
        {source.type === "memory" ? "Open this memory" : "Open diary"}
      </Link>
    </div>
  );
}
