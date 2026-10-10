import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev` from the repo root serves the API on 127.0.0.1:8000.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
