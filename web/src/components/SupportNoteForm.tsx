import { useState, type FormEvent } from "react";
import { saveSupportNote } from "../safety/saveSupportNote";
import { useAppSession } from "../session/AppSession";

/** Discreet default from the support-note example in packages/core. */
const DEFAULT_TITLE = "Saved from tonight's conversation";

type SupportNoteFormProps = {
  onClose: () => void;
};

export function SupportNoteForm({ onClose }: SupportNoteFormProps) {
  const { chatMode } = useAppSession();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [content, setContent] = useState("");
  const [aiMayUse, setAiMayUse] = useState(false);
  const [includeInHandoff, setIncludeInHandoff] = useState(true);
  const [step, setStep] = useState<"edit" | "approve">("edit");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement) || submitter.value !== "review") {
      return;
    }
    if (content.trim().length === 0) {
      setError("Write the note before saving.");
      return;
    }
    setError(null);
    setStep("approve");
  }

  async function approve() {
    if (saving || saved) {
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveSupportNote({
      title,
      content,
      accessLevel: aiMayUse ? "ai_eligible" : "private",
      includeInHandoff,
    });
    setSaving(false);
    if (!result.ok) {
      setError(
        result.reason === "locked"
          ? "The diary is locked. This note was not saved."
          : "This note was not saved. The diary service did not accept it.",
      );
      return;
    }
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-base text-ink">Saved.</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={review} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold leading-tight tracking-tight text-cove">
        Support note
      </h2>
      <p className="text-sm leading-relaxed text-ink/80">
        The AI cannot use this note unless you turn that on. It is included in
        the handoff summary unless you turn that off. Nothing is saved until
        you approve it.
      </p>
      {chatMode === "temporary" ? (
        <p className="text-base text-ink">This note will be saved to your diary.</p>
      ) : null}
      {step === "edit" ? (
        <>
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
            Note
            <textarea
              value={content}
              rows={5}
              onChange={(event) => setContent(event.target.value)}
              className="rounded-2xl border border-line bg-white px-4 py-3 text-base leading-6 text-ink outline-none focus:border-cove"
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-base text-ink">
            <input
              type="checkbox"
              checked={aiMayUse}
              onChange={(event) => setAiMayUse(event.target.checked)}
              className="size-5"
            />
            AI may use this note
          </label>
          <label className="flex min-h-11 items-center gap-3 text-base text-ink">
            <input
              type="checkbox"
              checked={includeInHandoff}
              onChange={(event) => setIncludeInHandoff(event.target.checked)}
              className="size-5"
            />
            Include in the handoff summary
          </label>
          {error ? (
            <p className="text-sm text-ink/80" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            value="review"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
          >
            Review this note
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-ink">
            {title.trim().length > 0 ? title.trim() : "Untitled"}
          </p>
          <p className="text-base leading-relaxed text-ink">{content.trim()}</p>
          <p className="text-base text-ink">Save this note?</p>
          {error ? (
            <p className="text-sm text-ink/80" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void approve()}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white disabled:opacity-60"
          >
            Save this note
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              setError(null);
              setStep("edit");
            }}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
          >
            Cancel
          </button>
        </>
      )}
    </form>
  );
}
