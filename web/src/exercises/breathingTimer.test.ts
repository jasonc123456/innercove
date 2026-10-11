import { describe, expect, it } from "vitest";
import { BreathingClock, breathingSnapshot } from "./breathingTimer";

describe("breathing timer calculations", () => {
  it("progresses through inhale, hold, exhale, then completes", () => {
    expect(breathingSnapshot("478", 1, 1).phase).toBe("inhale");
    expect(breathingSnapshot("478", 1, 4_000).phase).toBe("hold");
    expect(breathingSnapshot("478", 1, 11_000).phase).toBe("exhale");
    expect(breathingSnapshot("478", 1, 19_000).phase).toBe("complete");
  });

  it("uses elapsed timestamps so delayed ticks still report the correct phase", () => {
    const delayed = breathingSnapshot("comfortable", 2, 12_500);
    expect(delayed).toMatchObject({ phase: "inhale", completedCycles: 1, remainingSeconds: 2 });
  });

  it("starts idle and never exceeds the selected cycle count", () => {
    expect(breathingSnapshot("comfortable", 4, 0)).toMatchObject({ phase: "idle", remainingSeconds: 4 });
    expect(breathingSnapshot("comfortable", 4, 999_999).completedCycles).toBe(4);
  });

  it("pauses, resumes, restarts, and disposes without accumulating hidden time", () => {
    const clock = new BreathingClock();
    clock.start(100);
    clock.pause(4_100);
    expect(clock.elapsed(20_000)).toBe(4_000);
    clock.resume(20_000);
    expect(clock.elapsed(22_000)).toBe(6_000);
    clock.restart();
    expect(clock.elapsed(99_000)).toBe(0);
    clock.start(100_000);
    clock.dispose(100_000);
    expect(clock.elapsed(110_000)).toBe(0);
  });
});
