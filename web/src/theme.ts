import { useSyncExternalStore } from "react";

export const THEME_KEY = "innercove-theme";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Saved choice wins. Otherwise follow the system, without writing anything yet. */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* Private mode can block storage; the system theme still applies. */
  }
  return systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Remember an explicit choice so the rest of the site, and the next visit, keep it. */
export function persistTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* The attribute still themes this visit. */
  }
}

/**
 * One theme for the login toggle and the Settings switch.
 * Sign-in and sign-out do not call setTheme, so they cannot reset it.
 */
const listeners = new Set<() => void>();
let theme: Theme | undefined;

export function getTheme(): Theme {
  theme ??= readTheme();
  return theme;
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTheme(next: Theme) {
  theme = next;
  persistTheme(next);
  for (const listener of listeners) listener();
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function useTheme() {
  const current = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
  return { theme: current, setTheme, toggleTheme };
}
