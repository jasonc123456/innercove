import { Link } from "react-router-dom";
import { EXERCISES } from "../exercises/catalog";

export function ExercisesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-cove/75">Wellness toolkit</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">A little space for yourself.</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/75">Explore simple exercises to help you pause, reflect, and work through difficult moments at your own pace. They are optional wellness tools, not medical treatment or a substitute for care.</p>
      <h2 className="mt-8 text-2xl font-semibold text-ink">Explore exercises</h2>
      <p className="mt-1 text-base text-ink/70">Choose what feels right for you.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {EXERCISES.map((exercise) => (
          <article key={exercise.id} className="glass-card flex flex-col rounded-3xl border border-line bg-white/65 p-5">
            <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-semibold text-ink">{exercise.title}</h3><span className="rounded-full bg-foam px-2.5 py-1 text-xs font-medium text-cove">{exercise.available ? "Available now" : "Planned"}</span></div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/75">{exercise.description}</p>
            <p className="mt-4 text-xs text-ink/60">{exercise.available ? `${exercise.duration} · Optional` : exercise.level}</p>
            {exercise.available && exercise.route ? <Link to={exercise.route} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-cove px-4 text-sm font-semibold text-white">Start exercise</Link> : <p className="mt-4 text-sm font-medium text-ink/55">Coming later</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
