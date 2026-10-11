import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BreathingClock, breathingSnapshot, type BreathingStyle } from "../exercises/breathingTimer";

/** A drift-resistant, session-local timer. Only one timeout is active at a time. */
export function useBreathingTimer(style: BreathingStyle, cycles: number) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const clock = useRef(new BreathingClock());
  const timer = useRef<number | null>(null);

  const nowElapsed = useCallback(() => clock.current.elapsed(performance.now()), []);
  const tick = useCallback(() => setElapsedMs(nowElapsed()), [nowElapsed]);

  const stopLoop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    stopLoop();
    if (!running) return;
    const loop = () => {
      tick();
      timer.current = window.setTimeout(loop, 200);
    };
    loop();
    return stopLoop;
  }, [running, stopLoop, tick]);

  useEffect(() => () => clock.current.dispose(performance.now()), []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [tick]);

  const snapshot = useMemo(() => breathingSnapshot(style, cycles, elapsedMs), [cycles, elapsedMs, style]);
  useEffect(() => {
    if (snapshot.phase === "complete" && running) {
      clock.current.pause(performance.now());
      setRunning(false);
    }
  }, [elapsedMs, running, snapshot.phase]);

  const start = useCallback(() => {
    clock.current.start(performance.now());
    setElapsedMs(1); // moves from idle to the first phase immediately
    setRunning(true);
  }, []);
  const pause = useCallback(() => {
    clock.current.pause(performance.now());
    setElapsedMs(nowElapsed());
    setRunning(false);
  }, [nowElapsed]);
  const resume = useCallback(() => {
    if (snapshot.phase === "complete") return;
    clock.current.resume(performance.now());
    setRunning(true);
  }, [snapshot.phase]);
  const restart = useCallback(() => {
    clock.current.restart();
    setElapsedMs(0);
    setRunning(false);
  }, []);

  return { snapshot, running, start, pause, resume, restart, stop: restart };
}
