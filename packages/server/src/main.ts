import { existsSync, readFileSync } from "node:fs";
import { createProvider } from "./inference/index.js";
import { buildApp } from "./app.js";
import { fromRoot } from "./paths.js";
import { InMemoryChatStore, seedDemoPersona } from "./chat/in-memory-store.js";
import { loadSafetyConfigs, rulesSafety } from "./chat/rules-safety.js";
import { DatabaseStore } from "./store/db.js";

const env = process.env;
const host = env.HOST ?? "127.0.0.1";
const port = Number(env.PORT ?? 8000);

// D18: loopback only. Phone pairing (D31) will add its own HTTPS listener.
if (host !== "127.0.0.1" && host !== "::1" && env.ALLOW_NON_LOOPBACK !== "1") {
  throw new Error(`Refusing to bind ${host}; the app binds 127.0.0.1 only (D18)`);
}

const promptPath = [env.SYSTEM_PROMPT_PATH, "config/prompts/system-prompt.txt", "docs/prep/system-prompt.txt"]
  .filter((p): p is string => !!p)
  .map(fromRoot)
  .find((p) => existsSync(p));
if (!promptPath) throw new Error("No system prompt found; set SYSTEM_PROMPT_PATH");

if (env.DB_ENCRYPTION && env.DB_ENCRYPTION !== "sqlcipher") {
  throw new Error("This database foundation supports SQLCipher only; plaintext fallback is not implemented");
}
const database = new DatabaseStore(fromRoot(env.DB_PATH ?? "data/innercove.db"));

// DEV_STORE=demo: unencrypted in-memory store seeded with the fictional persona, until B's store lands (Phase 2).
let store: InMemoryChatStore | undefined;
if (env.DEV_STORE === "demo") {
  store = new InMemoryChatStore();
  seedDemoPersona(store, JSON.parse(readFileSync(fromRoot("docs/prep/demo-persona.json"), "utf8")));
}

const app = await buildApp({
  database,
  provider: createProvider(env),
  safety: rulesSafety(loadSafetyConfigs()),
  systemPrompt: readFileSync(promptPath, "utf8").trim(),
  stats: { lastReply: null },
  webDist: fromRoot(env.WEB_DIST ?? "web/dist"),
  ...(store ? { store } : {}),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      app.log.error({ event: "shutdown_failed" }, "Server shutdown failed");
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ host, port });
} catch (error) {
  await app.close();
  throw error;
}
app.log.info({ provider: env.INFERENCE_PROVIDER ?? "lmstudio", promptPath, store: store ? "demo (in-memory)" : "none" }, "InnerCove server ready");
