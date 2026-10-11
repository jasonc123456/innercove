import { useState, type FormEvent, type KeyboardEvent } from "react";

type MessageInputProps = {
  disabled: boolean;
  onSend: (text: string) => void;
};

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || trimmed.length === 0) {
      return;
    }
    onSend(trimmed);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-line bg-paper px-4 py-3 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <label htmlFor="message" className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="message"
          name="message"
          rows={2}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message"
          className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-3 text-base leading-6 text-ink outline-none placeholder:text-ink/55 focus:border-cove disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || trimmed.length === 0}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </form>
  );
}
