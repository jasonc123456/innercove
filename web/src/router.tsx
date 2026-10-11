import { Link, BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AdminPage } from "./pages/AdminPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HelpPage } from "./pages/HelpPage";
import { LoginPage } from "./pages/LoginPage";
import { MemoryPage } from "./pages/MemoryPage";
import { DiaryPage } from "./pages/DiaryPage";
import { ExercisesPage } from "./pages/ExercisesPage";
import { BreathingPage } from "./pages/BreathingPage";
import { useAppSession } from "./session/AppSession";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RequireSignIn />}>
          <Route index element={<DashboardPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="diary" element={<DiaryPage />} />
          <Route path="memories" element={<MemoryPage />} />
          <Route path="exercises" element={<ExercisesPage />} />
          <Route path="exercises/breathing" element={<BreathingPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function RequireSignIn() {
  const { signedIn, sessionChecked } = useAppSession();
  const { pathname } = useLocation();

  if (!sessionChecked) return <div className="h-dvh bg-paper" />;
  if (!signedIn) {
    if (pathname === "/") return <LoginPage />;
    if (pathname === "/help") return <SignedOutHelp />;
    return <Navigate to="/" replace />;
  }

  return <AppShell />;
}

function SignedOutHelp() {
  return (
    <div className="flex h-dvh flex-col bg-paper font-sans text-ink">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link
          to="/"
          className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-line px-3 text-sm font-medium text-cove focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cove"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to sign in
        </Link>
        <span className="text-lg font-semibold tracking-tight text-cove">Inner Cove</span>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <HelpPage />
      </main>
    </div>
  );
}
