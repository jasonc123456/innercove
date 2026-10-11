import { Link } from "react-router-dom";
import { EXERCISES } from "../exercises/catalog";

export function ExercisesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-cove/75">Optional wellness tools</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Exercises</h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-ink/75">Choose only what feels supportive today. These are optional wellness exercises, not medical treatment or a substitute for care.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {EXERCISES.map((exercise) => (
          <article key={exercise.id} className="glass-card flex flex-col rounded-3xl border border-line bg-white/65 p-5">
            <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold text-ink">{exercise.title}</h2><span className="rounded-full bg-foam px-2.5 py-1 text-xs font-medium text-cove">Optional</span></div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/75">{exercise.description}</p>
            <p className="mt-4 text-xs text-ink/60">{exercise.duration} · {exercise.level}</p>
            {exercise.available && exercise.route ? <Link to={exercise.route} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-cove px-4 text-sm font-semibold text-white">Start exercise</Link> : <p className="mt-4 text-sm font-medium text-ink/55">Coming later</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
