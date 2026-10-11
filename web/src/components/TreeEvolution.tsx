import { useEffect, useRef, useState } from "react";
export function TreeEvolution({ saving, onContinue }: { saving: boolean; onContinue: () => void }) {
  const [ready, setReady] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setReady(true); return; }
    const timer = window.setTimeout(() => setReady(true), 650);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) button.current?.focus(); }, [ready]);
  return <section className="mt-3 rounded-2xl border border-cove/30 bg-cove/5 p-4" aria-label="Tree growth celebration">
    <p role="status" className="font-medium text-cove"><svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1 inline h-6 w-6 align-middle" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 21V11M12 14C4 15 2 9 3 4c6 0 9 4 9 10ZM12 11c0-6 4-9 9-9 1 5-2 9-9 9Z" /></svg>Something lovely is happening… your tree is growing!</p>
    <p className="mt-1 text-sm text-ink/70">A little more room to grow. Every day you check in counts, whatever the feeling.</p>
    <button ref={button} type="button" disabled={!ready || saving} onClick={onContinue} className="mt-3 min-h-11 rounded-full bg-cove px-5 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove">{saving ? "Saving…" : "Continue"}</button>
  </section>;
}
