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
  const [level, setLevel] = useState(0);
  const recording = useRef<VoiceRecording | null>(null);
  useEffect(() => {
    const controller = new VoiceRecording(setVoice, text => setDraft(current => appendTranscript(current, text)), setLevel);
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
      className="shrink-0 border-t border-line bg-paper page-x px-4 py-3 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <label htmlFor="message" className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <div className="flex w-14 shrink-0 flex-col items-center">
          <button type="button" aria-label={voice.phase === "recording" ? "Stop recording" : "Start microphone recording"}
            aria-pressed={voice.phase === "recording"}
            disabled={disabled || locked || !signedIn || (busy && voice.phase !== "recording")}
            onClick={() => voice.phase === "recording" ? recording.current?.stop() : void recording.current?.start()}
            className={`inline-flex h-11 w-11 flex-col items-center justify-center rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove disabled:opacity-40 ${voice.phase === "recording" ? "border-cove bg-cove/10 text-cove" : "border-line text-ink"}`}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            </svg>
            {voice.phase === "recording" && <span className="text-[10px] leading-3">Stop</span>}
          </button>
          <div role={voice.phase === "recording" ? "img" : undefined}
            aria-label={voice.phase === "recording" ? "Microphone level" : undefined}
            aria-hidden={voice.phase !== "recording"}
            className="flex h-5 w-10 items-center justify-center gap-1">
            {voice.phase === "recording" && [.55, .8, 1, .8, .55].map((weight, index) => (
              <span key={index} className="w-1 rounded-full bg-cove transition-[height] duration-100 motion-reduce:transition-none"
                style={{ height: `${3 + 15 * level * weight}px` }} />
            ))}
          </div>
          <span className="h-4 whitespace-nowrap text-[10px] text-ink">{voice.phase === "recording" ? "Mic level" : "Mic"}</span>
        </div>
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
        <button type="button" disabled={!busy} onClick={() => recording.current?.cancel()}
          className={`min-h-11 rounded-xl px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove ${busy ? "" : "invisible"}`}>Cancel</button>
        {voice.phase === "processing" && <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-line border-t-cove animate-spin motion-reduce:animate-none" />}
        <span role="status" aria-live="polite">
          {voice.error ?? (voice.phase === "recording" ? `Recording ${voice.seconds}s / 60s` : voice.phase === "processing" ? "Transcribing locally…" : voice.phase === "requesting" ? "Waiting for microphone permission…" : "Voice adds to your draft. Review it before Send.")}
        </span>
      </div>
    </form>
  );
}
