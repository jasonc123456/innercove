import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAppSession,
  type AccessLevel,
  type PracticeMemory,
} from "../session/AppSession";

/** Signing in (D47) already unlocked the hub, so the page opens straight onto its data. */
export function MemoryPage() {
  return <MemoryWorkspace />;
}

function MemoryWorkspace() {
  const { memories, pinnedMemoryIds, hubProblem, addMemory, updateMemory, deleteMemory, pinMemory } =
    useAppSession();
  const [params] = useSearchParams();
  const focusId = params.get("id");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [pinNote, setPinNote] = useState<string | null>(null);

  const editing =
    editingId === "new"
      ? null
      : memories.find((memory) => memory.id === editingId) ?? null;

  if (editingId === "new" || editing) {
    return (
      <MemoryForm
        memory={editing}
        onCancel={() => setEditingId(null)}
        onSubmit={(input) => {
          if (editing) {
            updateMemory(editing.id, input);
          } else {
            addMemory(input);
          }
          setEditingId(null);
        }}
        onDelete={
          editing
            ? () => {
                deleteMemory(editing.id);
                setEditingId(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 page-x px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
            Memories
          </h1>
        </div>
        <p className="text-sm text-ink/70">
          Stored encrypted on your hub. With &ldquo;Use memories&rdquo; on, the AI may use the relevant ones marked &ldquo;AI may use this&rdquo;.
        </p>
        {hubProblem ? (
          <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink" role="alert">{hubProblem}</p>
        ) : null}
        <p className="text-sm text-ink/70">
          {pinnedMemoryIds.length} of 5 selected for this chat.
        </p>
        {pinNote ? (
          <p className="text-sm text-ink/80" role="status">
            {pinNote}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
        >
          New memory
        </button>
      </div>
      {memories.length === 0 ? (
        <p className="page-x px-4 py-6 text-base text-ink/75">No memories yet.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto page-x px-4 py-4">
          {memories.map((memory) => {
            const pinned = pinnedMemoryIds.includes(memory.id);
            const focused = memory.id === focusId;
            return (
              <li
                key={memory.id}
                data-memory-id={memory.id}
                className={
                  focused
                    ? "flex flex-col gap-2 rounded-2xl bg-foam px-4 py-3 ring-2 ring-cove"
                    : "flex flex-col gap-2 rounded-2xl bg-foam px-4 py-3"
                }
              >
                <p className="text-base leading-relaxed text-ink">{memory.content}</p>
                <p className="text-sm text-ink/70">
                  {memory.accessLevel === "private" ? "Private" : "AI may use this"}
                  {" · "}
                  Approved
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(memory.id)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-line bg-paper px-4 text-base text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={memory.accessLevel !== "ai_eligible"}
                    onClick={() => setPinNote(pinMemory(memory.id))}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white disabled:bg-line disabled:text-ink/60"
                  >
                    {pinned ? "Remove from this chat" : "Use this memory in this chat"}
                  </button>
                  {memory.accessLevel !== "ai_eligible" ? (
                    <p className="text-sm text-ink/70">
                      Turn on AI access before using this in a chat.
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MemoryForm({
  memory,
  onCancel,
  onSubmit,
  onDelete,
}: {
  memory: PracticeMemory | null;
  onCancel: () => void;
  onSubmit: (input: { content: string; accessLevel: AccessLevel }) => void;
  onDelete?: () => void;
}) {
  const [content, setContent] = useState(memory?.content ?? "");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    memory?.accessLevel ?? "private",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim().length === 0) {
      setError("Write the memory.");
      return;
    }
    onSubmit({ content: content.trim(), accessLevel });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto page-x px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
          {memory ? "Edit memory" : "New memory"}
        </h1>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
        >
          Memories
        </button>
      </div>
      <p className="text-sm text-ink/70">
        Saved on your hub. Memories you write are approved straight away.
      </p>
      <label className="flex flex-col gap-2 text-sm text-ink/80">
        Memory
        <textarea
          value={content}
          rows={6}
          onChange={(event) => setContent(event.target.value)}
          className="rounded-2xl border border-line bg-white px-4 py-3 text-base leading-6 text-ink outline-none focus:border-cove"
        />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-base text-ink">
        <input
          type="checkbox"
          checked={accessLevel === "ai_eligible"}
          onChange={(event) =>
            setAccessLevel(event.target.checked ? "ai_eligible" : "private")
          }
          className="size-5"
        />
        AI may use this memory
      </label>
      {error ? (
        <p className="text-sm text-ink/80" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
      >
        {memory ? "Update memory" : "Add memory"}
      </button>
      {onDelete && !confirmingDelete ? (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
        >
          Delete
        </button>
      ) : null}
      {onDelete && confirmingDelete ? (
        <div className="flex flex-col gap-2">
          <p className="text-base text-ink">Delete this memory?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
            >
              Delete this memory
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
            >
              Keep
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
