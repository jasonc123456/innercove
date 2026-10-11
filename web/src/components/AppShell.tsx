import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppSession } from "../session/AppSession";

const STORAGE_NOTE = "Saved chats are stored on the hub. The diary still stays in this tab.";

function sectionClass(isActive: boolean): string {
  return [
    "inline-flex h-11 items-center gap-1.5 rounded-2xl px-3 text-base",
    isActive ? "bg-foam font-semibold text-cove" : "text-ink/80",
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
] as const;

export function AppShell() {
  const { chatMode } = useAppSession();
  const home = useLocation().pathname === "/";

  return (
    <div className="app-root flex h-dvh flex-col bg-paper font-sans text-ink lg:flex-row">
      {/* Phone and tablet: the stacked header. */}
      <header className="shrink-0 border-b border-line bg-paper px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold tracking-tight text-cove">
                InnerCove
              </p>
              <p className="text-sm text-ink/70">
                {chatMode === "temporary" ? "Temporary" : "Save"}
              </p>
            </div>
            <p className="max-w-40 text-right text-xs leading-snug text-ink/80">
              {STORAGE_NOTE}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Sections">
            {SECTIONS.map((s) => (
              <NavLink key={s.to} to={s.to} end={s.to === "/"} className={({ isActive }) => sectionClass(isActive)}>
                <NavIcon>{s.icon}</NavIcon>
                {s.label}
              </NavLink>
            ))}
          </nav>
          <NavLink
            to="/help"
            className={({ isActive }) =>
              isActive
                ? "inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
                : "inline-flex h-11 items-center justify-center rounded-2xl border border-cove px-4 text-base font-medium text-cove"
            }
          >
            Get help
          </NavLink>
        </div>
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
          "mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col",
          // Home spreads its cards over the ambient background; other pages sit in one glass sheet.
          home ? "lg:max-w-6xl" : "glass-panel lg:my-6 lg:max-w-3xl lg:self-stretch",
        ].join(" ")}
      >
        <Outlet />
      </main>
    </div>
  );
}
