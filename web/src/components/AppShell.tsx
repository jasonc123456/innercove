import { NavLink, Outlet } from "react-router-dom";
import { useAppSession } from "../session/AppSession";

function sectionClass(isActive: boolean): string {
  return [
    "inline-flex h-11 items-center rounded-2xl px-4 text-base",
    isActive ? "bg-foam font-semibold text-cove" : "text-ink/80",
  ].join(" ");
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
            <p className="max-w-40 text-right text-xs leading-snug text-ink/70">
              Save and the diary stay in this tab. They are not stored.
            </p>
          </div>
          <nav className="flex gap-2" aria-label="Sections">
            <NavLink to="/" end className={({ isActive }) => sectionClass(isActive)}>
              Chat
            </NavLink>
            <NavLink to="/diary" className={({ isActive }) => sectionClass(isActive)}>
              Diary
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
