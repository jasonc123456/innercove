import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ChatPage } from "./pages/ChatPage";
import { DiaryPage } from "./pages/DiaryPage";
import { HelpPage } from "./pages/HelpPage";
import { MemoryPage } from "./pages/MemoryPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ChatPage />} />
          <Route path="diary" element={<DiaryPage />} />
          <Route path="memories" element={<MemoryPage />} />
          <Route path="help" element={<HelpPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
