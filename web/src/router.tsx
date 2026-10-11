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
      <header className="shrink-0 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link to="/" className="text-lg font-semibold tracking-tight text-cove">
          Inner Cove
        </Link>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <HelpPage />
      </main>
    </div>
  );
}
