import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppSession } from "../session/AppSession";

/**
 * D49: InnerCove sends every memory the user hasn't excluded and decides which help.
 * This lets the user exclude one (or bring it back) without leaving the chat.
 */
export function MemoryPicker({ onClose }: { onClose: () => void }) {
  const { memories, setMemoryAccess } = useAppSession();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inUse = memories.filter((memory) => memory.accessLevel === "ai_eligible").length;

  return (
    <>
      {/* Tapping anywhere else closes the picker. */}
      <button type="button" aria-label="Close memory picker" className="fixed inset-0 z-10 cursor-default bg-ink/10" onClick={onClose} />
      <div
        id="memory-picker"
        role="dialog"
        aria-labelledby="memory-picker-title"
        className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-[min(28rem,60dvh)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
      >
        <div className="shrink-0 border-b border-line px-4 py-3">
          <p id="memory-picker-title" className="text-base font-semibold text-ink">
            Memories InnerCove can use
          </p>
          <p className="mt-1 text-xs leading-snug text-ink/65">
            InnerCove noted these in saved chats and decides which help each reply. Switch one off to exclude it.
          </p>
        </div>

        {memories.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink/75">Nothing yet. InnerCove notes things worth remembering as you talk in a saved chat.</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {memories.map((memory) => {
              const used = memory.accessLevel === "ai_eligible";
              return (
                <li key={memory.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-foam/60">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0"
                      checked={used}
                      onChange={async () => setNote(await setMemoryAccess(memory.id, used ? "private" : "ai_eligible"))}
                    />
                    <span className={used ? "line-clamp-3 text-sm leading-snug text-ink" : "line-clamp-3 text-sm leading-snug text-ink/50"}>
                      {memory.content}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <p className="text-xs text-ink/65" role="status">
            {note ?? `${inUse} of ${memories.length} in use`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/memories" className="inline-flex h-9 items-center rounded-full px-3 text-sm text-cove">
              Manage
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-full bg-cove px-4 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
