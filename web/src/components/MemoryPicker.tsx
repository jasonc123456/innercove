import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppSession } from "../session/AppSession";

/**
 * Pin memories for this chat without leaving it (D27). Pinned memories are sent with every
 * message; the hub still adds up to 5 others that match what the user writes.
 */
export function MemoryPicker({ onClose }: { onClose: () => void }) {
  const { memories, pinnedMemoryIds, pinMemory } = useAppSession();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const usable = memories.filter((memory) => memory.accessLevel === "ai_eligible");
  const hidden = memories.length - usable.length;

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
            Pin memories to this chat
          </p>
          <p className="mt-1 text-xs leading-snug text-ink/65">
            Pinned memories go with every message, up to 5. Others are picked automatically when they match what you
            write.
          </p>
        </div>

        {usable.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink/75">
            {memories.length === 0 ? "No memories yet." : "None of your memories allow AI access yet."}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {usable.map((memory) => {
              const pinned = pinnedMemoryIds.includes(memory.id);
              return (
                <li key={memory.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-foam/60">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0"
                      checked={pinned}
                      onChange={() => setNote(pinMemory(memory.id))}
                    />
                    <span className="line-clamp-3 text-sm leading-snug text-ink">{memory.content}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <p className="text-xs text-ink/65" role="status">
            {note ?? `${pinnedMemoryIds.length} of 5 pinned`}
            {hidden > 0 && !note ? ` · ${hidden} private not shown` : ""}
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
