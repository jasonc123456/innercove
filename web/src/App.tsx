import { AppSessionProvider } from "./session/AppSession";
import { AppRouter } from "./router";

export function App() {
  return (
    <AppSessionProvider>
      <AppRouter />
    </AppSessionProvider>
  );
}
