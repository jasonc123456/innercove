import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAppSession,
  type AccessLevel,
  type PracticeMemory,
} from "../session/AppSession";
import { useTimeZone } from "../timeZone";

/** Signing in (D47) already unlocked the hub, so the page opens straight onto its data. */
export function MemoryPage() {
  return <MemoryWorkspace />;
}

function MemoryWorkspace() {
  // D49: InnerCove writes memories itself from saved chats; the user corrects, excludes or deletes them.
  const { memories, hubProblem, updateMemory, deleteMemory, setMemoryAccess } = useAppSession();
  const { formatDate } = useTimeZone();
  const [params] = useSearchParams();
  const focusId = params.get("id");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accessNote, setAccessNote] = useState<string | null>(null);

  const editing = memories.find((memory) => memory.id === editingId) ?? null;

  if (editing) {
    return (
      <MemoryForm
        memory={editing}
        onCancel={() => setEditingId(null)}
        onSubmit={(input) => {
          updateMemory(editing.id, input);
          setEditingId(null);
        }}
        onDelete={() => {
          deleteMemory(editing.id);
          setEditingId(null);
        }}
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
          What InnerCove has noted about you from saved chats, stored encrypted on your hub. With
          &ldquo;Memories&rdquo; on in a chat, InnerCove can use the ones marked &ldquo;AI may use this&rdquo;.
          Switch one off to exclude it, or delete it.
        </p>
        {hubProblem ? (
          <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink" role="alert">{hubProblem}</p>
        ) : null}
        {accessNote ? (
          <p className="text-sm text-ink/80" role="status">
            {accessNote}
          </p>
        ) : null}
      </div>
      {memories.length === 0 ? (
        <p className="page-x px-4 py-6 text-base text-ink/75">
          Nothing yet. As you talk in a saved chat, InnerCove notes things worth remembering here.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto page-x px-4 py-4">
          {memories.map((memory) => {
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
                <p className="text-xs text-ink/60">
                  {memory.origin === "ai_proposal" ? "Noted by InnerCove" : "Added by you"}
                  {" · "}
                  {formatDate(memory.createdAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-auto inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={memory.accessLevel === "ai_eligible"}
                      onChange={async (event) =>
                        setAccessNote(await setMemoryAccess(memory.id, event.target.checked ? "ai_eligible" : "private"))
                      }
                    />
                    AI may use this
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingId(memory.id)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-line bg-paper px-4 text-sm text-ink"
                  >
                    Edit or delete
                  </button>
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
  memory: PracticeMemory;
  onCancel: () => void;
  onSubmit: (input: { content: string; accessLevel: AccessLevel }) => void;
  onDelete: () => void;
}) {
  const [content, setContent] = useState(memory.content);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    memory.accessLevel,
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
          Edit memory
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
        Correct what InnerCove noted, exclude it from the AI, or delete it.
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
        Update memory
      </button>
      {!confirmingDelete ? (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
        >
          Delete
        </button>
      ) : null}
      {confirmingDelete ? (
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
