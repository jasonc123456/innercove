import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useAppSession } from "../session/AppSession";
import { VoiceRecording, appendTranscript, type VoiceState } from "../voice/recording";

type MessageInputProps = {
  disabled: boolean;
  onSend: (text: string) => void;
};

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [draft, setDraft] = useState("");
  const { locked, signedIn, chatMode } = useAppSession();
  const [voice, setVoice] = useState<VoiceState>({ phase: "idle", seconds: 0 });
  const recording = useRef<VoiceRecording | null>(null);
  useEffect(() => {
    const controller = new VoiceRecording(setVoice, text => setDraft(current => appendTranscript(current, text)));
    recording.current = controller;
    return () => { controller.cancel(); recording.current = null; };
  }, []);
  useEffect(() => { recording.current?.cancel(); }, [locked, signedIn, chatMode, disabled]);
  const busy = voice.phase !== "idle";
  const trimmed = draft.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || busy || trimmed.length === 0) {
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
          disabled={disabled || busy || trimmed.length === 0}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <button type="button" disabled={disabled || locked || !signedIn || (busy && voice.phase !== "recording")}
          onClick={() => voice.phase === "recording" ? recording.current?.stop() : void recording.current?.start()}
          className="min-h-11 rounded-xl border border-line px-3">
          {voice.phase === "recording" ? "Stop recording" : "Microphone"}
        </button>
        {busy && <button type="button" onClick={() => recording.current?.cancel()} className="min-h-11 px-3">Cancel</button>}
        <span role="status" aria-live="polite">
          {voice.error ?? (voice.phase === "recording" ? `Recording ${voice.seconds}s / 60s` : voice.phase === "processing" ? "Transcribing locally…" : voice.phase === "requesting" ? "Waiting for microphone permission…" : "Voice adds to your draft. Review it before Send.")}
        </span>
      </div>
    </form>
  );
}
