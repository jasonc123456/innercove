import { useEffect, useRef, useState } from "react";
import coveWash from "../assets/cove-wash.jpg";
import { streamAssistantReply } from "../chat/streamReply";
import { MessageInput } from "../components/MessageInput";
import { MessageList } from "../components/MessageList";
import { useAppSession, uuidv7 } from "../session/AppSession";

export function ChatPage() {
  const {
    chatMode,
    useMemories,
    pinnedMemoryIds,
    setChatMode,
    setUseMemories,
    chatMessages: messages,
    setChatMessages: setMessages,
    chatConversation,
  } = useAppSession();
  const [streamingId, setStreamingId] = useState<string | null>(null);
  // Switching mode starts a fresh saved conversation; temporary turns are never saved.
  // Only a real switch resets it: coming back from the diary keeps the conversation (D33 demo step).
  if (chatConversation.current.mode !== chatMode) {
    chatConversation.current = { id: null, mode: chatMode };
  }
  const [failed, setFailed] = useState(false);
  const [openSource, setOpenSource] = useState<{
    messageId: string;
    sourceId: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dismissedExerciseIds = useRef<("breathing478" | "comfortable-breathing")[]>([]);

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
    const assistantId = uuidv7();
    setMessages((current) => [
      ...current,
      { id: uuidv7(), role: "user", content: text },
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
        {
          message: text,
          history,
          useMemories,
          pinnedMemoryIds,
          dismissedExerciseIds: dismissedExerciseIds.current,
          ...(chatMode === "saved" ? { saved: { conversationId: chatConversation.current.id } } : {}),
        },
        {
          onDelta: (chunk) => setReply((content) => content + chunk),
          onReplace: (replacement) => setReply(() => replacement),
          onContext: (context) =>
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, context } : message,
              ),
            ),
          onHistoryExcluded: (count) =>
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, historyExcluded: count }
                  : message,
              ),
            ),
          onMeta: (meta) => {
            // Saved chats: the hub's conversation id comes from the first reply's `meta` event.
            if (chatMode === "saved" && meta.conversationId) chatConversation.current.id = meta.conversationId;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, tier: meta.tier } : message,
              ),
            );
          },
          onSuggestedExercise: (suggestion) => setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, suggestedExercise: suggestion } : message)),
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
      {/* One compact row of controls, so the conversation keeps the height. */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-line px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-full bg-foam p-1" role="group" aria-label="Save or temporary">
            <button
              type="button"
              aria-pressed={chatMode === "temporary"}
              onClick={() => setChatMode("temporary")}
              className={chatMode === "temporary" ? "inline-flex h-9 flex-1 items-center justify-center rounded-full bg-white px-3 text-sm font-semibold text-cove shadow-sm" : "inline-flex h-9 flex-1 items-center justify-center rounded-full px-3 text-sm text-ink/70"}
            >
              Temporary
            </button>
            <button
              type="button"
              aria-pressed={chatMode === "saved"}
              onClick={() => setChatMode("saved")}
              className={chatMode === "saved" ? "inline-flex h-9 flex-1 items-center justify-center rounded-full bg-white px-3 text-sm font-semibold text-cove shadow-sm" : "inline-flex h-9 flex-1 items-center justify-center rounded-full px-3 text-sm text-ink/70"}
            >
              Save
            </button>
          </div>
          <label className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={useMemories}
              onChange={(event) => setUseMemories(event.target.checked)}
              className="size-5"
            />
            Memories
          </label>
        </div>
        <p className="text-xs leading-snug text-ink/65" role="status">
          {chatMode === "saved" ? "Saved in the hub's encrypted database." : "Temporary: not saved on the hub."}
          {useMemories ? ` Using memories (${pinnedMemoryIds.length} selected).` : ""}
        </p>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(rgb(243 239 230 / 0.55), rgb(243 239 230 / 0.72) 42%, rgb(243 239 230 / 0.4)), url(${coveWash})`,
        }}
      >
        <MessageList
          messages={messages}
          streamingId={streamingId}
          openSource={openSource}
          onOpenSource={(messageId, sourceId) =>
            setOpenSource({ messageId, sourceId })
          }
          onCloseSource={() => setOpenSource(null)}
          onDismissExercise={(id) => {
            dismissedExerciseIds.current = [...new Set([...dismissedExerciseIds.current, id])];
            setMessages((current) => current.map((message) => message.suggestedExercise?.id === id ? { ...message, suggestedExercise: undefined } : message));
          }}
        />
        {failed ? (
          <p className="px-4 pb-2 text-sm text-ink/70" role="status">
            The reply stopped. Try sending again.
          </p>
        ) : null}
      </div>
      <MessageInput disabled={streamingId !== null} onSend={handleSend} />
    </div>
  );
}
