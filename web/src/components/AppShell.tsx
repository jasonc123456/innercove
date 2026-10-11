import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppSession } from "../session/AppSession";
import { useTheme } from "../theme";

const STORAGE_NOTE = "Saved chats, your diary and memories are stored encrypted on your hub.";

/** The site-wide dark mode switch (theme.ts): saved on this browser, kept across sign-in and sign-out. */
function DarkModeSwitch({ id, className }: { id: string; className: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={className}>
      <span id={id}>Dark mode</span>
      <button type="button" role="switch" className="theme-switch" aria-labelledby={id} aria-checked={theme === "dark"} onClick={toggleTheme} />
    </div>
  );
}

/** Phone tab bar (Taobao-style): icon over a short label; colour marks the current tab. */
function tabClass(isActive: boolean): string {
  return [
    "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-none transition-colors",
    isActive ? "font-semibold text-cove" : "text-ink/60",
  ].join(" ");
}

/** Desktop sidebar rows: a lighter material marks the current place (wayfinding). */
function sideClass(isActive: boolean): string {
  return [
    "flex h-11 items-center gap-3 rounded-2xl px-4 text-[15px] transition-colors",
    isActive ? "bg-white/85 font-semibold text-cove shadow-sm" : "text-ink/75 hover:bg-white/45",
  ].join(" ");
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const SECTIONS = [
  {
    to: "/",
    label: "Home",
    icon: (
      <>
        <path d="m4 11 8-6.5 8 6.5v8.5H4z" strokeLinejoin="round" />
        <path d="M10 19.5v-5h4v5" strokeLinejoin="round" />
      </>
    ),
  },
  { to: "/chat", label: "Chat", icon: <path d="M5 6.5h14v8.5H9l-4 3v-3H5z" strokeLinejoin="round" /> },
  {
    to: "/diary",
    label: "Diary",
    icon: (
      <>
        <path d="M7 4.5h10.5v15H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5z" strokeLinejoin="round" />
        <path d="M9.5 8.5h5M9.5 12h5" strokeLinecap="round" />
      </>
    ),
  },
  { to: "/memories", label: "Memories", icon: <path d="M7 4.5h10v15l-5-3-5 3z" strokeLinejoin="round" /> },
  { to: "/exercises", label: "Wellness toolkit", icon: <><path d="M5 12h14" strokeLinecap="round" /><path d="M8 8c1.2 1.3 1.2 2.7 0 4s-1.2 2.7 0 4M16 8c1.2 1.3 1.2 2.7 0 4s-1.2 2.7 0 4" strokeLinecap="round" /></> },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/admin",
    label: "Admin",
    icon: <path d="M12 4 5.5 6.5v5c0 4 2.8 7.2 6.5 8.5 3.7-1.3 6.5-4.5 6.5-8.5v-5z" strokeLinejoin="round" />,
  },
] as const;

/** Phones show the first four sections as tabs; the rest go under "More" (•••). */
const TABS = SECTIONS.slice(0, 4);
const MORE = SECTIONS.slice(4);

export function AppShell() {
  const { chatMode } = useAppSession();
  const path = useLocation().pathname;
  const home = path === "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some((s) => path === s.to || path.startsWith(`${s.to}/`));

  // The menu closes on navigation and on Escape.
  useEffect(() => setMoreOpen(false), [path]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <div className="app-root flex h-dvh flex-col bg-paper font-sans text-ink lg:flex-row">
      {/* Phone and tablet: one slim row on top, so the page (and chat) gets the height; help stays in reach. */}
      <header className="bg-paper flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 lg:hidden">
        <p className="text-lg font-semibold tracking-tight text-cove">InnerCove</p>
        <NavLink
          to="/help"
          className={({ isActive }) =>
            isActive
              ? "inline-flex h-9 items-center rounded-full bg-cove px-4 text-sm font-semibold text-white"
              : "inline-flex h-9 items-center rounded-full border border-cove px-4 text-sm font-semibold text-cove"
          }
        >
          Get help
        </NavLink>
      </header>

      {/* Desktop: a translucent sidebar over the ambient background; help is always in reach. */}
      <aside className="glass hidden w-72 shrink-0 flex-col border-r border-white/60 px-5 pt-8 pb-6 lg:flex" aria-label="InnerCove">
        <div className="px-2">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-cove">InnerCove</p>
          <p className="mt-1 text-sm text-ink/60">Your space, at your pace</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-ink/70">
            <span className={`size-2 rounded-full ${chatMode === "temporary" ? "bg-ink/35" : "bg-cove"}`} aria-hidden="true" />
            {chatMode === "temporary" ? "Temporary chat" : "Saving chats"}
          </p>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.to === "/"} className={({ isActive }) => sideClass(isActive)}>
              <NavIcon>{s.icon}</NavIcon>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <DarkModeSwitch id="sidebar-dark-mode" className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-ink/80" />
          <p className="rounded-2xl bg-white/50 px-4 py-3 text-xs leading-relaxed text-ink/65">{STORAGE_NOTE}</p>
          <NavLink
            to="/help"
            className={({ isActive }) =>
              isActive
                ? "flex h-12 items-center justify-center rounded-2xl bg-cove px-4 text-base font-semibold text-white"
                : "flex h-12 items-center justify-center rounded-2xl border border-cove/70 bg-white/60 px-4 text-base font-semibold text-cove"
            }
          >
            Get help
          </NavLink>
        </div>
      </aside>

      <main
        className={[
          // Phones and tablets: full width so scrollbars sit at the window edge; `page-x` centres the content.
          "mx-auto flex min-h-0 w-full flex-1 flex-col",
          // Home spreads its cards over the ambient background; other pages sit in one glass sheet.
          home ? "lg:max-w-6xl" : "glass-panel lg:my-6 lg:max-w-3xl lg:self-stretch",
        ].join(" ")}
      >
        <Outlet />
      </main>

      {/* Phone and tablet: the tab bar sits under the page, above the home indicator. */}
      <nav
        className="relative flex shrink-0 border-t border-line bg-paper px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden"
        aria-label="Sections"
      >
        {TABS.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.to === "/"} className={({ isActive }) => tabClass(isActive)}>
            <NavIcon>{s.icon}</NavIcon>
            {s.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={tabClass(inMore || moreOpen)}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <NavIcon>
            <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" strokeLinecap="round" />
          </NavIcon>
          More
        </button>

        {moreOpen ? (
          <>
            {/* Tapping anywhere else closes the menu. */}
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-10 cursor-default bg-ink/10"
              onClick={() => setMoreOpen(false)}
            />
            <div
              id="more-menu"
              className="absolute right-2 bottom-full z-20 mb-2 w-52 overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
            >
              {MORE.map((s) => (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={({ isActive }) =>
                    `flex h-12 items-center gap-3 px-4 text-base ${isActive ? "bg-foam font-semibold text-cove" : "text-ink"}`
                  }
                >
                  <NavIcon>{s.icon}</NavIcon>
                  {s.label}
                </NavLink>
              ))}
              <DarkModeSwitch id="more-dark-mode" className="flex h-12 items-center justify-between gap-3 border-t border-line px-4 text-base text-ink" />
            </div>
          </>
        ) : null}
      </nav>
    </div>
  );
}
