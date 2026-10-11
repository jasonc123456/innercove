import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTimeZone } from "../timeZone";

import { CHECK_IN_MOODS as moods, moodStyle } from "../check-ins/moods";
import { useCheckIns } from "../check-ins/useCheckIns";
import { MoodTree } from "../components/MoodTree";
import { TreeEvolution } from "../components/TreeEvolution";

const quotes = [
  { text: "Little by little, a little becomes a lot.", by: "Tanzanian proverb" },
  { text: "No feeling is final.", by: "Rainer Maria Rilke" },
  { text: "Almost everything will work again if you unplug it for a few minutes, including you.", by: "Anne Lamott" },
  { text: "You do not have to see the whole staircase. Just take the first step.", by: "Martin Luther King Jr." },
  { text: "Be where your feet are.", by: "Unknown" },
];

export function DashboardPage() {
  const quote = useMemo(() => quotes[new Date().getDate() % quotes.length]!, []);
  // The greeting and date follow the time zone chosen in Settings.
  const { zone } = useTimeZone();
  const { data, problem, saving, saveMood, acknowledge, reload } = useCheckIns(zone);
  const logs = data?.days ?? [];
  const currentDay = logs.find(day => day.day === data?.today);
  const selected = currentDay ? moodStyle(currentDay.mood) : null;
  const greeting = useMemo(() => {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (hour < 5) return "Still up? Go gently tonight.";
    if (hour < 12) return "Good morning.";
    if (hour < 18) return "Good afternoon.";
    return "Good evening.";
  }, [zone, data?.today]);
  const today = useMemo(
    () => new Date().toLocaleDateString(undefined, { timeZone: zone, weekday: "long", month: "long", day: "numeric" }),
    [zone, data?.today],
  );

  return (
    <div className="dashboard-scroll min-h-0 flex-1 overflow-y-auto page-x px-4 py-5 lg:px-10 lg:py-12">
      {/* Desktop only: a quiet, time-aware greeting above the grid. */}
      <header className="dashboard-welcome hidden lg:mb-8 lg:block">
        <p className="text-sm font-medium text-ink/55">{today}</p>
        <h1 className="mt-1 text-5xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink">{greeting}</h1>
      </header>
      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
      <section className="dashboard-welcome rounded-[2rem] bg-cove px-6 py-7 text-white shadow-sm lg:col-span-7 lg:flex lg:flex-col lg:justify-center lg:bg-gradient-to-br lg:from-cove lg:to-[#2b6662] lg:px-10 lg:py-10">
        <p className="text-sm font-medium tracking-wide text-white/75 lg:hidden">Your space, at your pace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back.</h1>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-white/85">
          Take a small moment to notice how you are arriving today.
        </p>
        <Link
          to="/chat"
          className="mt-5 inline-flex h-11 items-center justify-center self-start rounded-2xl bg-white px-5 lg:mt-7 lg:h-12 lg:px-6 text-base font-semibold text-cove shadow-sm transition hover:bg-foam focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-cove"
        >
          Continue to chat
        </Link>
      </section>

      <section className="glass-card mt-5 rounded-[1.7rem] border border-line bg-white/70 p-5 shadow-sm lg:col-span-5 lg:mt-0 lg:flex lg:flex-col lg:justify-center lg:border-white/70 lg:p-8" aria-labelledby="quote-title">
        <p id="quote-title" className="text-sm font-semibold uppercase tracking-[0.14em] text-cove">Today&apos;s thought</p>
        <blockquote className="mt-3 text-xl leading-snug text-ink lg:text-2xl lg:leading-snug lg:tracking-[-0.01em]">“{quote.text}”</blockquote>
        <p className="mt-3 text-sm text-ink/65">— {quote.by}</p>
      </section>

      <section className="glass-card mt-5 rounded-[1.7rem] border border-line bg-white/70 p-5 shadow-sm lg:col-span-12 lg:mt-0 lg:grid lg:grid-cols-2 lg:gap-10 lg:border-white/70 lg:p-8" aria-labelledby="mood-title">
        <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cove">Daily check-in</p>
            <h2 id="mood-title" className="mt-1 text-xl font-semibold tracking-tight">How are you feeling?</h2>
          </div>
          <p className="max-w-28 text-right text-xs leading-snug text-ink/60">One leaf per day, whatever the feeling.</p>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2" role="group" aria-label="Choose a mood">
          {moods.map((mood) => (
            <button
              key={mood.label}
              type="button"
              onClick={() => void saveMood(mood.id)}
              disabled={saving || !data}
              aria-pressed={selected?.id === mood.id}
              className="mood-choice flex min-h-20 lg:min-h-28 lg:rounded-3xl flex-col items-center justify-center rounded-2xl border px-1 text-center transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cove"
              style={{ backgroundColor: mood.shade, borderColor: mood.color }}
              aria-label={`Log mood: ${mood.label}`}
            >
              <span className="text-2xl lg:text-3xl" aria-hidden="true">{mood.emoji}</span>
              {/* The tiles stay pastel in both themes, so their label keeps dark ink. */}
              <span className="mt-1 text-xs font-semibold text-[#1c2430]">{mood.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-5 text-sm text-ink/70" role="status">
          {selected ? `${selected.emoji} ${selected.note} Today’s leaf reflects your latest feeling.` : "Choose the feeling that fits best right now. Saved privately in your encrypted hub."}
        </p>

        {problem && <p role="alert" className="mt-2 text-sm text-ink">{problem} <button type="button" onClick={() => void reload()} className="min-h-11 underline">Retry</button></p>}
        <p className="mt-2 text-xs text-ink/60">Changing your mood today recolors the same leaf. Colors describe feelings; growth celebrates showing up. Days follow your Settings time zone ({zone}). Check-ins are not shared with the AI.</p>
        </div>
        <div className="lg:flex lg:flex-col">
        {data ? <MoodTree days={logs} evolving={data.pendingStage !== null} /> : <p role="status" className="p-5">Loading your tree…</p>}
        {data?.pendingStage && <TreeEvolution key={data.pendingStage} saving={saving} onContinue={() => void acknowledge(data.pendingStage!)} />}
        <p className="mt-1 text-center text-xs text-ink/55 lg:mt-3">{logs.length === 0 ? "Your sapling is ready when you are." : `${logs.length} unique check-in day${logs.length === 1 ? "" : "s"}.`}</p>
        {logs.length > 0 && <details className="mt-3 text-sm text-ink/70"><summary className="cursor-pointer py-2">Daily leaf history</summary><ul className="max-h-48 overflow-auto">{logs.map(day => <li key={day.day}>{day.day} · {moodStyle(day.mood).label}</li>)}</ul></details>}
        </div>
      </section>
      </div>
    </div>
  );
}
