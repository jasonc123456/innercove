import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // D's crisis config lives beside web/, and the help page bundles it.
    fs: { allow: [".."] },
    // `npm run dev` from the repo root serves the API on 127.0.0.1:8000. From a laptop,
    // point at the GX10 instead: `INNERCOVE_API=http://192.168.2.151:8000 npm run dev` (D46).
    proxy: { "/api": process.env.INNERCOVE_API ?? "http://127.0.0.1:8000" },
  },
});
