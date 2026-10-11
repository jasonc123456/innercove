import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBreathingTimer } from "../hooks/useBreathingTimer";
import type { BreathingStyle } from "../exercises/breathingTimer";

const FEEDBACK = ["A little calmer", "About the same", "More uncomfortable", "Prefer not to say"] as const;

export function BreathingPage() {
  const [params] = useSearchParams();
  const [style, setStyle] = useState<BreathingStyle>(params.get("style") === "comfortable" ? "comfortable" : "478");
  const [cycles, setCycles] = useState(1);
  const { snapshot, running, start, pause, resume, restart, stop } = useBreathingTimer(style, cycles);
  const [feedback, setFeedback] = useState<(typeof FEEDBACK)[number] | null>(null);
  const complete = snapshot.phase === "complete";
  const ready = snapshot.phase === "idle";
  const phaseLabel = snapshot.phase === "idle" ? "Ready when you are" : snapshot.phase === "complete" ? "Session complete" : snapshot.phase[0]!.toUpperCase() + snapshot.phase.slice(1);
  const circleClass = snapshot.phase === "inhale" ? "breathing-circle breathing-inhale" : snapshot.phase === "exhale" ? "breathing-circle breathing-exhale" : "breathing-circle";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto page-x px-4 py-5 sm:px-6">
      <Link to="/exercises" className="inline-flex min-h-11 items-center text-sm font-medium text-cove">← All exercises</Link>
      <div className="mx-auto w-full max-w-2xl text-center">
        <p className="mt-2 text-sm font-medium uppercase tracking-[0.18em] text-cove/75">Guided exercise</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Breathing exercises</h1>
        <h2 className="mt-1 text-xl font-medium text-cove">{style === "478" ? "4-7-8 Breathing" : "Comfortable paced breathing"}</h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-ink/75">This is an optional relaxation exercise, not medical treatment. Stop at any time and return to comfortable, natural breathing.</p>

        {ready ? <Setup style={style} cycles={cycles} setStyle={setStyle} setCycles={setCycles} onStart={start} /> : complete ? <Complete feedback={feedback} setFeedback={setFeedback} onRestart={() => { setFeedback(null); restart(); }} /> : (
          <section className="mt-7 rounded-3xl border border-line bg-white/65 px-5 py-7 shadow-sm" aria-live="polite">
            <BreathingVisual className={circleClass} phase={snapshot.phase} remaining={snapshot.remainingSeconds} reducedText={snapshot.instruction} />
            <p className="mt-5 text-2xl font-semibold text-ink">{phaseLabel}</p>
            <p className="mt-2 text-lg text-cove">{snapshot.instruction}</p>
            <p className="mt-2 text-sm text-ink/65">{snapshot.remainingSeconds} second{snapshot.remainingSeconds === 1 ? "" : "s"} remaining · Cycle {snapshot.completedCycles + 1} of {cycles}</p>
            <progress className="mt-5 h-2 w-full accent-cove" value={snapshot.elapsedSeconds} max={snapshot.totalSeconds}> {snapshot.elapsedSeconds} of {snapshot.totalSeconds} seconds </progress>
            <p className="mt-2 text-xs text-ink/60">{snapshot.elapsedSeconds}s of about {snapshot.totalSeconds}s</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {running ? <button type="button" onClick={pause} className="min-h-11 rounded-2xl border border-cove px-5 font-semibold text-cove">Pause</button> : <button type="button" onClick={resume} className="min-h-11 rounded-2xl bg-cove px-5 font-semibold text-white">Resume</button>}
              <button type="button" onClick={restart} className="min-h-11 rounded-2xl px-4 text-cove">Restart</button>
              <button type="button" onClick={stop} className="min-h-11 rounded-2xl px-4 text-ink/75">End exercise</button>
            </div>
          </section>
        )}
        <aside className="mt-5 rounded-2xl border border-lavender bg-lavender/30 p-4 text-left text-sm leading-relaxed text-ink/80">
          <p className="font-semibold text-ink">Your comfort comes first</p>
          <p className="mt-1">4-7-8 includes a breath hold, which can feel uncomfortable. You can skip the hold, switch to comfortable 4-in / 6-out breathing, pause, or stop whenever you want. Do not push through dizziness or discomfort.</p>
        </aside>
        <Link to="/chat" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-cove px-5 text-sm font-semibold text-cove">Return to chat</Link>
      </div>
    </div>
  );
}

function Setup({ style, cycles, setStyle, setCycles, onStart }: { style: BreathingStyle; cycles: number; setStyle: (style: BreathingStyle) => void; setCycles: (cycles: number) => void; onStart: () => void }) {
  return <section className="mt-7 rounded-3xl border border-line bg-white/65 p-5 text-left shadow-sm"><h3 className="text-lg font-semibold text-ink">Choose your pace</h3><fieldset className="mt-4"><legend className="text-sm font-medium text-ink">Style</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><Choice checked={style === "478"} onClick={() => setStyle("478")} title="4-7-8 breathing" text="Inhale 4 · optional hold 7 · exhale 8" /><Choice checked={style === "comfortable"} onClick={() => setStyle("comfortable")} title="Comfortable breathing" text="Inhale 4 · exhale 6 · no hold" /></div></fieldset><fieldset className="mt-5"><legend className="text-sm font-medium text-ink">Cycles (1–4; four is the suggested maximum for a first session)</legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4].map((value) => <button key={value} type="button" aria-pressed={cycles === value} onClick={() => setCycles(value)} className={cycles === value ? "min-h-11 min-w-11 rounded-2xl bg-cove px-4 font-semibold text-white" : "min-h-11 min-w-11 rounded-2xl border border-line px-4 text-ink"}>{value}</button>)}</div></fieldset><button type="button" onClick={onStart} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-cove px-5 font-semibold text-white">Start when ready</button></section>;
}
function Choice({ checked, onClick, title, text }: { checked: boolean; onClick: () => void; title: string; text: string }) { return <button type="button" aria-pressed={checked} onClick={onClick} className={checked ? "rounded-2xl border-2 border-cove bg-foam p-3 text-left" : "rounded-2xl border border-line p-3 text-left"}><span className="block font-semibold text-ink">{title}</span><span className="mt-1 block text-sm text-ink/70">{text}</span></button>; }
function BreathingVisual({ className, phase, remaining, reducedText }: { className: string; phase: string; remaining: number; reducedText: string }) { return <div className="mx-auto flex size-56 items-center justify-center rounded-full border border-cove/30 bg-foam/45"><div className={className} data-phase={phase}><span className="text-4xl font-semibold text-cove">{remaining}</span><span className="sr-only">{reducedText}, {remaining} seconds remaining</span></div></div>; }
function Complete({ feedback, setFeedback, onRestart }: { feedback: (typeof FEEDBACK)[number] | null; setFeedback: (feedback: (typeof FEEDBACK)[number]) => void; onRestart: () => void }) { return <section className="mt-7 rounded-3xl border border-cove/25 bg-foam/55 p-6"><p className="text-2xl font-semibold text-ink">Session complete</p><p className="mt-2 text-ink/75">You chose to take a short pause. You can return to normal breathing whenever you like.</p><fieldset className="mt-5 text-left"><legend className="font-medium text-ink">How do you feel after this exercise?</legend><div className="mt-3 grid gap-2">{FEEDBACK.map((answer) => <button key={answer} type="button" aria-pressed={feedback === answer} onClick={() => setFeedback(answer)} className={feedback === answer ? "min-h-11 rounded-2xl border-2 border-cove bg-white px-4 text-left font-medium text-cove" : "min-h-11 rounded-2xl border border-line bg-white/70 px-4 text-left text-ink"}>{answer}</button>)}</div></fieldset>{feedback === "More uncomfortable" ? <p className="mt-4 rounded-2xl bg-white/80 p-3 text-left text-sm text-ink">Please stop this technique and return to comfortable, natural breathing. You do not need to push through discomfort.</p> : null}<button type="button" onClick={onRestart} className="mt-5 min-h-11 rounded-2xl border border-cove px-5 font-semibold text-cove">Start another session</button></section>; }
