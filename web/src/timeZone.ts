import { useSyncExternalStore } from "react";

export const TIME_ZONE_KEY = "innercove-time-zone";

/** "auto" follows the device; otherwise an IANA zone such as "America/Los_Angeles". */
export type TimeZoneChoice = "auto" | string;

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Every zone the browser knows, or a short fallback list on older browsers. */
export function allTimeZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (supported) return supported("timeZone");
  return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Hong_Kong", "Asia/Tokyo", "Australia/Sydney"];
}

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function readChoice(): TimeZoneChoice {
  try {
    const stored = localStorage.getItem(TIME_ZONE_KEY);
    if (stored && stored !== "auto" && isValidZone(stored)) return stored;
  } catch {
    /* Private mode can block storage; the device zone still applies. */
  }
  return "auto";
}

/** Saved on this browser like the theme (theme.ts), and kept across sign-in and sign-out. */
const listeners = new Set<() => void>();
let choice: TimeZoneChoice | undefined;

function getChoice(): TimeZoneChoice {
  choice ??= readChoice();
  return choice;
}

export function setTimeZoneChoice(next: TimeZoneChoice) {
  choice = next === "auto" || isValidZone(next) ? next : "auto";
  try {
    if (choice === "auto") localStorage.removeItem(TIME_ZONE_KEY);
    else localStorage.setItem(TIME_ZONE_KEY, choice);
  } catch {
    /* The choice still applies for this visit. */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The chosen zone and formatters that use it. */
export function useTimeZone() {
  const current = useSyncExternalStore(subscribe, getChoice, getChoice);
  const zone = current === "auto" ? deviceTimeZone() : current;
  return {
    choice: current,
    zone,
    setChoice: setTimeZoneChoice,
    /** "Sun, Oct 11, 2026, 2:30 AM PDT" */
    formatDateTime: (iso: string) =>
      new Date(iso).toLocaleString(undefined, {
        timeZone: zone,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    /** "Oct 11, 2026" */
    formatDate: (iso: string) =>
      new Date(iso).toLocaleDateString(undefined, { timeZone: zone, year: "numeric", month: "short", day: "numeric" }),
  };
}
