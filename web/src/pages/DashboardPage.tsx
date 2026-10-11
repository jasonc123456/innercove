import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Mood = {
  label: string;
  emoji: string;
  color: string;
  shade: string;
  note: string;
};

const moods: Mood[] = [
  { label: "Bright", emoji: "☀️", color: "#f6b84b", shade: "#fff0c9", note: "A warm, hopeful day." },
  { label: "Steady", emoji: "🌿", color: "#55a66a", shade: "#daf1dc", note: "Grounded and getting through it." },
  { label: "Calm", emoji: "💧", color: "#54a8bb", shade: "#d7f0f3", note: "A quieter moment." },
  { label: "Heavy", emoji: "☁️", color: "#8a7ab8", shade: "#e7e1f5", note: "It is okay to move gently today." },
  { label: "Low", emoji: "🌙", color: "#ca6d82", shade: "#f8dce3", note: "You do not have to carry it alone." },
];

const quotes = [
  { text: "Little by little, a little becomes a lot.", by: "Tanzanian proverb" },
  { text: "No feeling is final.", by: "Rainer Maria Rilke" },
  { text: "Almost everything will work again if you unplug it for a few minutes, including you.", by: "Anne Lamott" },
  { text: "You do not have to see the whole staircase. Just take the first step.", by: "Martin Luther King Jr." },
  { text: "Be where your feet are.", by: "Unknown" },
];

export function DashboardPage() {
  const [logs, setLogs] = useState<Mood[]>([]);
  const [selected, setSelected] = useState<Mood | null>(null);
  const quote = useMemo(() => quotes[new Date().getDate() % quotes.length]!, []);

  function logMood(mood: Mood) {
    setLogs((current) => [...current, mood]);
    setSelected(mood);
  }

  return (
    <div className="dashboard-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5">
      <section className="dashboard-welcome rounded-[2rem] bg-cove px-6 py-7 text-white shadow-sm">
        <p className="text-sm font-medium tracking-wide text-white/75">Your space, at your pace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back.</h1>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-white/85">
          Take a small moment to notice how you are arriving today.
        </p>
        <Link
          to="/chat"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-base font-semibold text-cove shadow-sm transition hover:bg-foam focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-cove"
        >
          Continue to chat
        </Link>
      </section>

      <section className="mt-5 rounded-[1.7rem] border border-line bg-white/70 p-5 shadow-sm" aria-labelledby="quote-title">
        <p id="quote-title" className="text-sm font-semibold uppercase tracking-[0.14em] text-cove">Today&apos;s thought</p>
        <blockquote className="mt-3 text-xl leading-snug text-ink">“{quote.text}”</blockquote>
        <p className="mt-3 text-sm text-ink/65">— {quote.by}</p>
      </section>

      <section className="mt-5 rounded-[1.7rem] border border-line bg-white/70 p-5 shadow-sm" aria-labelledby="mood-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cove">Daily check-in</p>
            <h2 id="mood-title" className="mt-1 text-xl font-semibold tracking-tight">How are you feeling?</h2>
          </div>
          <p className="max-w-28 text-right text-xs leading-snug text-ink/60">Each check-in grows your little tree.</p>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2" role="group" aria-label="Choose a mood">
          {moods.map((mood) => (
            <button
              key={mood.label}
              type="button"
              onClick={() => logMood(mood)}
              className="mood-choice flex min-h-20 flex-col items-center justify-center rounded-2xl border px-1 text-center transition focus:outline-none focus:ring-2 focus:ring-cove"
              style={{ backgroundColor: mood.shade, borderColor: mood.color }}
              aria-label={`Log mood: ${mood.label}`}
            >
              <span className="text-2xl" aria-hidden="true">{mood.emoji}</span>
              <span className="mt-1 text-xs font-semibold text-ink">{mood.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-5 text-sm text-ink/70" role="status">
          {selected ? `${selected.emoji} ${selected.note} A ${selected.color === "#ca6d82" ? "gentle" : "new"} leaf has joined your tree.` : "Choose the feeling that fits best right now."}
        </p>

        <MoodTree leaves={logs} />
        <p className="mt-1 text-center text-xs text-ink/55">{logs.length === 0 ? "Your sapling is ready when you are." : `${logs.length} check-in${logs.length === 1 ? "" : "s"} in this session.`}</p>
      </section>
    </div>
  );
}

// Branches appear as the tree grows; every leaf sits ON a visible branch.
const BRANCHES = [
  { d: "M129 135c-19-14-33-26-43-45", width: 7, from: 0 },
  { d: "M130 118c17-13 31-28 38-46", width: 7, from: 0 },
  { d: "M128 92c-15-10-25-23-28-39", width: 6, from: 3 },
  { d: "M130 93c13-11 22-24 25-39", width: 6, from: 3 },
  { d: "M128 91c-1-8 0-15 1-21", width: 7, from: 6 }, // trunk grows taller for the top pair
  { d: "M129 71c-9-9-14-20-15-32", width: 5, from: 6 },
  { d: "M129 71c9-9 14-20 15-33", width: 5, from: 6 },
] as const;

// [x, y, angle]: the leaf's base sits on the branch (a tip or a midpoint) and points outward.
// Leaf n only uses a branch that is already visible when there are n + 1 leaves.
const SPOTS = [
  [86, 90, -134], [168, 72, -50], [100, 53, -126], [155, 54, -57], [104, 114, 165],
  [114, 39, -115], [144, 38, -66], [153, 97, 12], [146, 75, -18], [129, 70, -90],
] as const;

function MoodTree({ leaves }: { leaves: Mood[] }) {
  const shown = leaves.slice(-SPOTS.length);
  const grown = leaves.length;

  return (
    <div className="mt-5 overflow-hidden rounded-3xl bg-[#e8f1e6] px-2 py-3 lg:mt-0 lg:flex lg:h-full lg:items-end lg:py-6" aria-label={`Growing mood tree with ${leaves.length} leaves`}>
      <svg viewBox="0 0 260 210" className="mx-auto block h-48 max-w-full lg:h-72" role="img">
        <title>Your mood sapling</title>
        <path d="M0 186c40-12 72-8 112 2 49 13 101 9 148-5v27H0z" fill="#c7dfc2" />
        <path d="M130 188C129 154 131 122 128 91" fill="none" stroke="#6d5239" strokeWidth="10" strokeLinecap="round" />
        {BRANCHES.filter((b) => grown >= b.from).map((b) => (
          <path key={b.d} d={b.d} fill="none" stroke="#6d5239" strokeWidth={b.width} strokeLinecap="round" />
        ))}
        <ellipse cx="130" cy="190" rx="33" ry="7" fill="#a6c99e" opacity=".75" />
        {shown.map((mood, index) => {
          const [x, y, angle] = SPOTS[index]!;
          return (
            // The outer group places and turns the leaf; the inner one grows it from its base,
            // so the CSS animation never overrides the placement.
            <g key={`${mood.label}-${index}`} transform={`translate(${x} ${y}) rotate(${angle})`}>
              <g className="tree-leaf">
                <path d="M0 0C5-6.5 14-8.5 23 0C14 8.5 5 6.5 0 0Z" fill={mood.color} />
                <path d="M2 0H18" stroke="#fff" strokeOpacity=".35" strokeWidth="1" strokeLinecap="round" />
              </g>
            </g>
          );
        })}
        {leaves.length === 0 ? <circle cx="128" cy="86" r="11" fill="#91bf81" opacity=".9" /> : null}
      </svg>
    </div>
  );
}
