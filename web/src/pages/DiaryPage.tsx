import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAppSession,
  type AccessLevel,
  type DiaryEntry,
} from "../session/AppSession";

/** Signing in (D47) already unlocked the hub, so the page opens straight onto its data. */
export function DiaryPage() {
  return <DiaryWorkspace />;
}

function DiaryWorkspace() {
  const { entries, hubProblem, addEntry, updateEntry, deleteEntry } = useAppSession();
  const [params] = useSearchParams();
  const focusId = params.get("id");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const normalized = query.trim().toLowerCase();
  const visible = entries.filter((entry) => {
    if (normalized.length === 0) {
      return true;
    }
    const title = entry.title ?? "";
    return `${title}\n${entry.content}`.toLowerCase().includes(normalized);
  });

  const editing =
    editingId === "new"
      ? null
      : entries.find((entry) => entry.id === editingId) ?? null;

  if (editingId === "new" || editing) {
    return (
      <EntryForm
        entry={editing}
        onCancel={() => setEditingId(null)}
        onSubmit={(input) => {
          if (editing) {
            updateEntry(editing.id, input);
          } else {
            addEntry(input);
          }
          setEditingId(null);
        }}
        onDelete={
          editing
            ? () => {
                deleteEntry(editing.id);
                setEditingId(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
            Diary
          </h1>
        </div>
        <p className="text-sm text-ink/70">
          Stored encrypted on your hub. Only entries marked &ldquo;AI may use this&rdquo; can be used in a chat.
        </p>
        {hubProblem ? (
          <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink" role="alert">{hubProblem}</p>
        ) : null}
        <label className="flex flex-col gap-2 text-sm text-ink/80">
          Search your diary
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
          />
        </label>
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
        >
          New entry
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-6 text-base text-ink/75">No diary entries yet.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {visible.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setEditingId(entry.id)}
                data-entry-id={entry.id}
                className={
                  entry.id === focusId
                    ? "flex w-full flex-col items-start gap-1 rounded-2xl bg-foam px-4 py-3 text-left ring-2 ring-cove"
                    : "flex w-full flex-col items-start gap-1 rounded-2xl bg-foam px-4 py-3 text-left"
                }
              >
                <span className="text-base font-medium text-ink">
                  {entry.title ?? "Untitled"}
                </span>
                <span className="text-sm text-ink/70">
                  {entry.accessLevel === "private"
                    ? "Private"
                    : "AI may use this"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryForm({
  entry,
  onCancel,
  onSubmit,
  onDelete,
}: {
  entry: DiaryEntry | null;
  onCancel: () => void;
  onSubmit: (input: {
    title: string;
    content: string;
    accessLevel: AccessLevel;
  }) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    entry?.accessLevel ?? "private",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim().length === 0) {
      setError("Write something in the entry.");
      return;
    }
    onSubmit({ title, content: content.trim(), accessLevel });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
          {entry ? "Edit entry" : "New entry"}
        </h1>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
        >
          Entries
        </button>
      </div>
      <p className="text-sm text-ink/70">Saved encrypted on your hub.</p>
      <label className="flex flex-col gap-2 text-sm text-ink/80">
        Title
        <input
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-ink/80">
        Entry
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
        AI may use this entry
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
        {entry ? "Update entry" : "Add entry"}
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
          <p className="text-base text-ink">Delete this entry?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
            >
              Delete this entry
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

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <rect x="6" y="10" width="12" height="9" rx="1.5" />
      <path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" />
    </svg>
  );
}
