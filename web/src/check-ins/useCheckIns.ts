import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckInMood, CheckInsResponse, TreeStage } from "../../../packages/core/src/tree-growth";
import { useAppSession, uuidv7 } from "../session/AppSession";

/** Only a working copy. Encrypted hub rows own count, day/color and acknowledgement. */
export function useCheckIns(timeZone: string) {
  const { signedIn, locked } = useAppSession();
  const [data, setData] = useState<CheckInsResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const writing = useRef(false);
  const refreshAfterWrite = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const load = useCallback(async () => {
    if (!active.current) return;
    if (writing.current) { refreshAfterWrite.current = true; return; }
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch(`/api/check-ins?timeZone=${encodeURIComponent(timeZone)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("unavailable");
      const result = (await response.json()) as CheckInsResponse;
      if (active.current && version === generation.current) { setData(result); setProblem(null); }
    } catch {
      if (!controller.signal.aborted && active.current && version === generation.current) setProblem("Couldn't load your check-ins. Please try again.");
    }
  }, [timeZone]);
  useEffect(() => {
    active.current = signedIn && !locked;
    setData(null); setProblem(null); setSaving(false); writing.current = false; refreshAfterWrite.current = false;
    if (!active.current) return;
    void load();
    // Notifications contain no moods, dates or user data. Fallback poll/focus also
    // covers unsupported channels, missed notifications and midnight boundaries.
    try { channel.current = new BroadcastChannel("innercove-check-ins"); channel.current.onmessage = () => void load(); } catch { channel.current = null; }
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    return () => {
      active.current = false; ++generation.current; request.current?.abort();
      channel.current?.close(); channel.current = null; window.clearInterval(timer);
      window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible);
    };
  }, [signedIn, locked, load]);
  async function write(path: string, payload: object) {
    if (!active.current || writing.current || !data) return;
    writing.current = true; setSaving(true); setProblem(null);
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, timeZone }), signal: controller.signal });
      if (!response.ok) throw new Error("unavailable");
      const result = (await response.json()) as CheckInsResponse;
      if (active.current && version === generation.current) {
        setData(result); channel.current?.postMessage({ type: "changed" });
      }
    } catch {
      if (!controller.signal.aborted && active.current && version === generation.current) setProblem("Couldn't save that change. Please try again; your saved days are kept.");
    } finally {
      if (version === generation.current) {
        writing.current = false;
        if (active.current) {
          setSaving(false);
          if (refreshAfterWrite.current) { refreshAfterWrite.current = false; void load(); }
        }
      }
    }
  }
  return { data, problem, saving, reload: load,
    saveMood: (mood: CheckInMood) => write("/api/check-ins", { mood, eventId: uuidv7() }),
    acknowledge: (stage: TreeStage) => write("/api/check-ins/evolution/acknowledge", { stage }),
  };
}
