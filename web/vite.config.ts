import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite runs this file in Node; declared here so web/ needs no @types/node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // D's crisis config lives beside web/, and the help page bundles it.
    fs: { allow: [".."] },
    // `npm run dev` from the repo root serves the API on 127.0.0.1:8000. From a laptop,
    // point at the GX10 instead: `INNERCOVE_API=http://192.168.2.151:8000 npm run dev` (D46).
    // changeOrigin stays false: the API's sign-in Origin check (D47) compares Origin with Host,
    // and the shorthand string form would rewrite Host to the API's own address.
    proxy: { "/api": { target: process.env.INNERCOVE_API ?? "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
