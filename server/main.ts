import { existsSync, readFileSync } from "node:fs";
import { createProvider } from "../core/inference/index.js";
import { buildApp } from "./app.js";
import { noSafety } from "./chat/safety.js";

const env = process.env;
const host = env.HOST ?? "127.0.0.1";
const port = Number(env.PORT ?? 8000);

// D18: loopback only. Phone pairing (D31) will add its own HTTPS listener.
if (host !== "127.0.0.1" && host !== "::1" && env.ALLOW_NON_LOOPBACK !== "1") {
  throw new Error(`Refusing to bind ${host}; the app binds 127.0.0.1 only (D18)`);
}

const promptPath = [env.SYSTEM_PROMPT_PATH, "config/prompts/system-prompt.txt", "docs/prep/system-prompt.txt"].find(
  (p): p is string => !!p && existsSync(p),
);
if (!promptPath) throw new Error("No system prompt found; set SYSTEM_PROMPT_PATH");

const app = await buildApp({
  provider: createProvider(env),
  // TODO(A): swap for D's core/safety once codex/safety-content is merged.
  safety: noSafety,
  systemPrompt: readFileSync(promptPath, "utf8").trim(),
  stats: { lastReply: null },
  webDist: env.WEB_DIST ?? "web/dist",
});

await app.listen({ host, port });
app.log.info({ provider: env.INFERENCE_PROVIDER ?? "lmstudio", promptPath }, "InnerCove server ready");
