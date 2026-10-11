import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAppSession } from "../session/AppSession";

function sectionClass(isActive: boolean): string {
  return [
    "inline-flex h-11 items-center gap-1.5 rounded-2xl px-3 text-base",
    isActive ? "bg-foam font-semibold text-cove" : "text-ink/80",
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

export function AppShell() {
  const { chatMode } = useAppSession();

  return (
    <div className="flex h-dvh flex-col bg-paper font-sans text-ink">
      <header className="shrink-0 border-b border-line bg-paper px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
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
              Saved chats are stored on the hub. The diary still stays in this tab.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Sections">
            <NavLink to="/" end className={({ isActive }) => sectionClass(isActive)}>
              <NavIcon>
                <path d="m4 11 8-6.5 8 6.5v8.5H4z" strokeLinejoin="round" />
                <path d="M10 19.5v-5h4v5" strokeLinejoin="round" />
              </NavIcon>
              Home
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => sectionClass(isActive)}>
              <NavIcon>
                <path d="M5 6.5h14v8.5H9l-4 3v-3H5z" strokeLinejoin="round" />
              </NavIcon>
              Chat
            </NavLink>
            <NavLink to="/diary" className={({ isActive }) => sectionClass(isActive)}>
              <NavIcon>
                <path d="M7 4.5h10.5v15H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5z" strokeLinejoin="round" />
                <path d="M9.5 8.5h5M9.5 12h5" strokeLinecap="round" />
              </NavIcon>
              Diary
            </NavLink>
            <NavLink to="/memories" className={({ isActive }) => sectionClass(isActive)}>
              <NavIcon>
                <path d="M7 4.5h10v15l-5-3-5 3z" strokeLinejoin="round" />
              </NavIcon>
              Memories
            </NavLink>
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
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
