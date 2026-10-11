import { useState } from "react";
import { CrisisResources } from "./CrisisResources";
import { SupportNoteForm } from "./SupportNoteForm";

/** `userText` prefills the support note with the user's own words from this turn (D30: saved only on their tap). */
export function CrisisCard({ userText }: { userText?: string }) {
  const [writing, setWriting] = useState(false);
  return (
    <section
      className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-paper px-4 py-3"
      aria-label="Crisis help"
    >
      <CrisisResources />
      {writing ? (
        <SupportNoteForm initialContent={userText ?? ""} onClose={() => setWriting(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
        >
          Save a support note
        </button>
      )}
    </section>
  );
}
