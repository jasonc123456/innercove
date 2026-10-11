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

/** Remember the login toggle so the rest of the site, and the next visit, keep it. */
export function persistTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* The attribute still themes this visit. */
  }
}
