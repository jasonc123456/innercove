import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ChatPage } from "./pages/ChatPage";
import { DiaryPage } from "./pages/DiaryPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ChatPage />} />
          <Route path="diary" element={<DiaryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
