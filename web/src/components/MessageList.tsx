import { useEffect, useRef, useState } from "react";
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
  /** Saved chats (D49): memories InnerCove wrote from the user's message in this exchange. */
  remembered?: { id: string; content: string }[];
  /** The model couldn't be reached: a notice in place of a reply, never sent back as history. */
  offline?: boolean;
};

/** Chips shown before "+N more": every memory is sent now (D49), so a reply can have many. */
const CHIP_LIMIT = 4;

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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
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
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isStreaming = message.id === streamingId;

        return (
          <li
            key={message.id}
            aria-live={isStreaming ? "polite" : undefined}
            className={
              isUser
                ? "ml-8 rounded-2xl bg-cove px-4 py-3 text-base leading-relaxed break-words text-white"
                : message.offline
                  ? "mr-8 rounded-2xl border border-dashed border-line bg-paper px-4 py-3 text-base leading-relaxed break-words text-ink/80"
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
              <CrisisCard userText={messages.slice(0, index).reverse().find((m) => m.role === "user")?.content} />
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
                  {(expanded.has(message.id) ? message.context.sources : message.context.sources.slice(0, CHIP_LIMIT)).map((source) => (
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
                  {!expanded.has(message.id) && message.context.sources.length > CHIP_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((current) => new Set(current).add(message.id))}
                      className="inline-flex min-h-11 items-center rounded-2xl px-3 text-sm text-cove underline decoration-cove/40 underline-offset-2"
                    >
                      +{message.context.sources.length - CHIP_LIMIT} more
                    </button>
                  ) : null}
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
            {!isUser && message.remembered && message.remembered.length > 0 ? (
              <Remembered items={message.remembered} />
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

/** D49: what InnerCove noted from the user's message, with exclude and delete right here. */
function Remembered({ items }: { items: { id: string; content: string }[] }) {
  const { memories, setMemoryAccess, deleteMemory } = useAppSession();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-line bg-paper/80 px-3 py-2.5">
      <p className="text-sm text-ink/70">Remembered from what you said</p>
      {items.map((item) => {
        const memory = memories.find((m) => m.id === item.id);
        const state = !memory ? "deleted" : memory.accessLevel === "private" ? "excluded" : "used";
        return (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className={state === "used" ? "text-sm text-ink" : "text-sm text-ink/50 line-through"}>{item.content}</p>
            {state === "deleted" ? (
              <span className="text-xs text-ink/60">Deleted</span>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={async () => setNote(await setMemoryAccess(item.id, state === "used" ? "private" : "ai_eligible"))}
                  className="inline-flex min-h-9 items-center rounded-full px-2.5 text-xs font-medium text-cove"
                >
                  {state === "used" ? "Don't use" : "Use again"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteMemory(item.id)}
                  className="inline-flex min-h-9 items-center rounded-full px-2.5 text-xs font-medium text-ink/70"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
      {note ? <p className="text-xs text-ink/70" role="status">{note}</p> : null}
    </div>
  );
}
