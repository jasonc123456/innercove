import { useEffect, useRef, useState } from "react";
import { CHAT_TONES, type ChatTone } from "../chat/streamReply";

/**
 * How InnerCove talks in this chat (D56): a pill beside the microphone that opens a small menu
 * above the composer. Safety replies and the crisis card never change with it.
 */
export function TonePicker({ tone, onChange, disabled }: { tone: ChatTone; onChange: (tone: ChatTone) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const current = CHAT_TONES.find((t) => t.id === tone) ?? CHAT_TONES[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLButtonElement>("[aria-checked=true]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tone: ${current.label}. Change how InnerCove talks`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-ink transition-colors hover:bg-foam/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove disabled:opacity-40 sm:h-9 sm:border sm:border-line sm:bg-foam/70 sm:pl-2.5 sm:pr-2 sm:text-xs"
      >
        <ToneIcon tone={current.id} />
        <span>{current.label}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className={open ? "rotate-180 transition-transform motion-reduce:transition-none" : "transition-transform motion-reduce:transition-none"}>
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Tone"
          className="voice-composer-enter absolute bottom-full right-0 z-20 mb-2 w-64 rounded-2xl border border-line bg-paper p-1.5 shadow-lg"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-ink/70">How InnerCove talks</p>
          {CHAT_TONES.map((option) => {
            const selected = option.id === tone;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  button.current?.focus();
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-cove ${selected ? "bg-foam" : "hover:bg-foam/60"}`}
              >
                <span className="mt-0.5 text-cove"><ToneIcon tone={option.id} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-ink">{option.label}</span>
                  <span className="text-xs leading-snug text-ink/65">{option.hint}</span>
                </span>
                {selected ? (
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-cove">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </button>
            );
          })}
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-ink/55">
            Safety replies and crisis support stay the same in every tone.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ToneIcon({ tone }: { tone: ChatTone }) {
  const common = { "aria-hidden": true, width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (tone === "calm") {
    // Still water.
    return <svg {...common}><path d="M3 10c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" /></svg>;
  }
  if (tone === "upbeat") {
    // Sun.
    return <svg {...common}><circle cx="12" cy="12" r="3.5" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></svg>;
  }
  // Warm: a heart.
  return <svg {...common}><path d="M12 19.5s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.2-7 9.6-7 9.6z" /></svg>;
}
