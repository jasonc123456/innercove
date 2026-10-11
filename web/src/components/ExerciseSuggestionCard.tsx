import { useState } from "react";
import { Link } from "react-router-dom";

export type ExerciseSuggestion = {
  id: "breathing478" | "comfortable-breathing";
  title: string;
  route: "/exercises/breathing";
  reason: string;
};

export function ExerciseSuggestionCard({ suggestion, onDismiss }: { suggestion: ExerciseSuggestion; onDismiss: (id: ExerciseSuggestion["id"]) => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const target = suggestion.id === "comfortable-breathing" ? `${suggestion.route}?style=comfortable` : suggestion.route;
  return (
    <aside className="mt-3 rounded-2xl border border-cove/25 bg-paper/80 p-3" aria-label="Optional breathing exercise">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foam text-xl text-cove" aria-hidden="true">〰</span>
        <div>
          <p className="font-semibold text-ink">{suggestion.title}</p>
          <p className="mt-1 text-sm leading-snug text-ink/75">Optional relaxation exercise. Go at your own pace; a no-hold option is available.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={target} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-cove px-4 text-sm font-semibold text-white">Start breathing exercise</Link>
        <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-sm text-cove" onClick={() => { setDismissed(true); onDismiss(suggestion.id); }}>Dismiss</button>
      </div>
    </aside>
  );
}
