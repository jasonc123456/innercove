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
  const stopButton = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const previousPhase = useRef<VoiceState["phase"]>("idle");
  const recording = useRef<VoiceRecording | null>(null);
  useEffect(() => {
    const controller = new VoiceRecording(setVoice, text => setDraft(current => appendTranscript(current, text)), setLevel);
    recording.current = controller;
    return () => { controller.cancel(); recording.current = null; };
  }, []);
  useEffect(() => { recording.current?.cancel(); }, [locked, signedIn, chatMode, disabled]);
  const busy = voice.phase !== "idle";
  const trimmed = draft.trim();
  const announcement = voice.error ?? (voice.phase === "recording" ? "Listening…" : voice.phase === "processing" ? "Transcribing…" : voice.phase === "requesting" ? "Waiting for microphone permission…" : "Ready to edit your draft. Sending remains your choice.");
  useEffect(() => {
    if (voice.phase === "recording") stopButton.current?.focus();
    else if (voice.phase !== "idle") cancelButton.current?.focus();
    else if (previousPhase.current !== "idle" && !disabled && signedIn && !locked) {
      document.getElementById("message")?.focus();
    }
    previousPhase.current = voice.phase;
  }, [voice.phase, disabled, signedIn, locked]);

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
      <div className="relative h-44">
        <div hidden={busy} style={busy ? { display: "none" } : undefined}
          className="voice-composer-enter flex h-full flex-col gap-2">
          <label htmlFor="message" className="sr-only">Message</label>
          <textarea id="message" name="message" rows={3} value={draft}
            disabled={disabled || busy} onChange={event => setDraft(event.target.value)} onKeyDown={handleKeyDown}
            placeholder="Write a message"
            className="min-h-0 min-w-0 flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-3 text-base leading-6 text-ink outline-none placeholder:text-ink/55 focus:border-cove disabled:opacity-60" />
          <div className="flex h-11 items-center justify-between gap-2">
            <button type="button" aria-label="Start microphone recording"
              disabled={disabled || locked || !signedIn || busy}
              onClick={() => void recording.current?.start()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove disabled:opacity-40">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
              </svg>
            </button>
            <button type="submit" disabled={disabled || busy || trimmed.length === 0}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove disabled:opacity-40">Send</button>
          </div>
        </div>
        {busy && <div key={voice.phase} className="voice-composer-enter absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-cove/40 bg-cove/5 px-3 py-2">
          <p className="font-medium text-cove" aria-hidden="true">
            {voice.phase === "recording" ? "Listening…" : voice.phase === "processing" ? "Transcribing…" : "Waiting for microphone…"}
          </p>
          <div className="flex h-10 items-center justify-center">
            {voice.phase === "recording" ? <div role="img" aria-label="Microphone level" className="flex h-10 items-center gap-2">
              {[.55, .8, 1, .8, .55].map((weight, index) => <span key={index}
                className="w-2 rounded-full bg-cove transition-[height] duration-100 motion-reduce:transition-none"
                style={{ height: `${4 + 32 * level * weight}px` }} />)}
            </div> : <span aria-hidden="true" className="h-6 w-6 rounded-full border-2 border-line border-t-cove animate-spin motion-reduce:animate-none" />}
          </div>
          <p className="h-4 text-xs text-ink/75">
            {voice.phase === "recording" ? <><span aria-hidden="true">{voice.seconds}s / 60s · </span>Microphone level</> : "Your draft is kept until you return."}
          </p>
          <div className="flex h-11 items-center justify-center gap-3">
            {voice.phase === "recording" && <button ref={stopButton} type="button" onClick={() => recording.current?.stop()}
              className="min-h-11 rounded-xl bg-cove px-5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove">Stop</button>}
            <button ref={cancelButton} type="button" onClick={() => recording.current?.cancel()}
              className="min-h-11 rounded-xl border border-line px-5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove">Cancel</button>
          </div>
        </div>}
      </div>
      <p className="mt-2 min-h-5 text-sm text-ink/75">{voice.error ?? (busy ? "Voice stays in your draft. Nothing is sent automatically." : "Voice adds to your draft. Review it before Send.")}</p>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </form>
  );
}
