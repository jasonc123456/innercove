import { existsSync, readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite runs this file in Node; declared here so web/ needs no @types/node.
declare const process: { env: Record<string, string | undefined> };

// D58: HTTPS when the dev compose mounts a certificate from `scripts/make-dev-cert.sh`, so phones
// and laptops get a secure context (the microphone). Without one, plain http as before.
const tlsDir = process.env.INNERCOVE_TLS_DIR;
const https =
  tlsDir && existsSync(`${tlsDir}/server.crt`) && existsSync(`${tlsDir}/server.key`)
    ? { cert: readFileSync(`${tlsDir}/server.crt`), key: readFileSync(`${tlsDir}/server.key`) }
    : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https,
    // The hub's Tailscale name (D48); IP addresses and localhost are always allowed.
    allowedHosts: [".ts.net"],
    // D's crisis config lives beside web/, and the help page bundles it.
    fs: { allow: [".."] },
    // `npm run dev` from the repo root serves the API on 127.0.0.1:8000. From a laptop,
    // point at the GX10 instead: `INNERCOVE_API=http://192.168.2.151:8000 npm run dev` (D46).
    // changeOrigin stays false: the API's sign-in Origin check (D47) compares Origin with Host,
    // and the shorthand string form would rewrite Host to the API's own address.
    proxy: { "/api": { target: process.env.INNERCOVE_API ?? "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
