import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="flex h-dvh flex-col bg-paper font-sans text-ink">
      <header className="shrink-0 border-b border-line bg-paper px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="mx-auto flex w-full max-w-lg items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-cove">
              InnerCove
            </p>
            <p className="text-sm text-ink/70">Temporary</p>
          </div>
          <p className="max-w-40 text-right text-xs leading-snug text-ink/70">
            Local mock. The chat API is not connected.
          </p>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
