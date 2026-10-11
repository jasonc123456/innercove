export type BreathingPhase = "idle" | "inhale" | "hold" | "exhale" | "complete";
export type BreathingStyle = "478" | "comfortable";

export type BreathingStep = { phase: Exclude<BreathingPhase, "idle" | "complete">; seconds: number; instruction: string };

export const BREATHING_PLANS: Record<BreathingStyle, readonly BreathingStep[]> = {
  "478": [
    { phase: "inhale", seconds: 4, instruction: "Inhale gently through your nose" },
    { phase: "hold", seconds: 7, instruction: "Hold only if it feels comfortable" },
    { phase: "exhale", seconds: 8, instruction: "Exhale slowly and comfortably" },
  ],
  comfortable: [
    { phase: "inhale", seconds: 4, instruction: "Inhale gently and comfortably" },
    { phase: "exhale", seconds: 6, instruction: "Exhale slowly, without forcing it" },
  ],
};

export type BreathingSnapshot = {
  phase: BreathingPhase;
  remainingSeconds: number;
  completedCycles: number;
  totalSeconds: number;
  elapsedSeconds: number;
  instruction: string;
};

/** Pure timestamp calculation: works correctly after a delayed background-tab tick. */
export function breathingSnapshot(style: BreathingStyle, cycles: number, elapsedMs: number): BreathingSnapshot {
  const plan = BREATHING_PLANS[style];
  const cycleMs = plan.reduce((total, step) => total + step.seconds * 1000, 0);
  const totalMs = cycleMs * cycles;
  const clamped = Math.max(0, elapsedMs);
  if (clamped >= totalMs) {
    return { phase: "complete", remainingSeconds: 0, completedCycles: cycles, totalSeconds: Math.ceil(totalMs / 1000), elapsedSeconds: Math.ceil(totalMs / 1000), instruction: "Session complete" };
  }
  if (clamped === 0) {
    return { phase: "idle", remainingSeconds: plan[0]!.seconds, completedCycles: 0, totalSeconds: Math.ceil(totalMs / 1000), elapsedSeconds: 0, instruction: "Ready when you are" };
  }

  const withinCycle = clamped % cycleMs;
  let cursor = 0;
  for (const step of plan) {
    const end = cursor + step.seconds * 1000;
    if (withinCycle < end) {
      const remaining = Math.max(1, Math.ceil((end - withinCycle) / 1000));
      return {
        phase: step.phase,
        remainingSeconds: remaining,
        completedCycles: Math.floor(clamped / cycleMs),
        totalSeconds: Math.ceil(totalMs / 1000),
        elapsedSeconds: Math.floor(clamped / 1000),
        instruction: step.instruction,
      };
    }
    cursor = end;
  }
  return { phase: "complete", remainingSeconds: 0, completedCycles: cycles, totalSeconds: Math.ceil(totalMs / 1000), elapsedSeconds: Math.ceil(totalMs / 1000), instruction: "Session complete" };
}

/** Framework-free clock used by the React hook and unit tests. */
export class BreathingClock {
  private carriedMs = 0;
  private startedAt: number | null = null;
  private disposed = false;

  start(now: number): void {
    if (this.disposed) return;
    this.carriedMs = 0;
    this.startedAt = now;
  }

  pause(now: number): void {
    if (this.disposed || this.startedAt === null) return;
    this.carriedMs += Math.max(0, now - this.startedAt);
    this.startedAt = null;
  }

  resume(now: number): void {
    if (!this.disposed && this.startedAt === null) this.startedAt = now;
  }

  restart(): void {
    if (this.disposed) return;
    this.carriedMs = 0;
    this.startedAt = null;
  }

  elapsed(now: number): number {
    return this.carriedMs + (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt));
  }

  dispose(now: number): void {
    this.pause(now);
    this.disposed = true;
  }
}
