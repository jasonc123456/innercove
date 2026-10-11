import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { InferenceProvider } from "./inference/index.js";
import type { ChatStore } from "./chat/ports.js";
import type { SafetyLayer } from "./chat/safety.js";
import type { SystemInfo } from "./system.js";
import { sendError } from "./api/errors.js";
import { chatRoutes } from "./api/chat.js";
import { healthRoutes } from "./api/health.js";
import { dataRoutes } from "./api/data.js";
import { privacyRoutes } from "./api/privacy.js";
import { databaseRoutes } from "./api/lock.js";
import { SessionStore, sessionRoutes, type SessionGuard } from "./api/session.js";
import { twoFactorRoutes } from "./api/two-factor.js";
import type { DatabaseStore } from "./store/db.js";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const;

export interface AppDeps {
  provider: InferenceProvider;
  safety: SafetyLayer;
  systemPrompt: string;
  /** Speed of the last fully measured reply, for the privacy panel (plan §3c, A's fields). In memory only. */
  stats: { lastReply: { firstWordMs: number; tokPerS: number } | null };
  /** Endpoint class, acceleration and memory for the privacy panel; defaults suit the fake provider. */
  system?: SystemInfo;
  database: DatabaseStore;
  /** Explicit test adapter; production uses the request-bound SQL store. */
  store?: ChatStore;
  webDist?: string;
  /** Test adapter for route tests that aren't about sign-in; production always uses the real SessionStore (D47). */
  sessionGuard?: SessionGuard;
}

export async function buildApp(deps: AppDeps, logger: FastifyServerOptions["logger"] = true) {
  // Fastify logs method, URL and status only; request and response bodies are never logged.
  const app = Fastify({ bodyLimit: 256 * 1024, logger: logger === false ? false : {
    ...(typeof logger === "object" ? logger : {}),
    serializers: {
      req: (request: { method: string; url: string }) => ({ method: request.method, url: request.url.split("?")[0]! }),
    },
  } });
  // D47: the sign-in guard runs before the lock gate and any database lease.
  const sessions = new SessionStore();
  const guard = deps.sessionGuard ?? sessions;
  sessionRoutes(app, deps.database, sessions, guard);
  databaseRoutes(app, deps.database);
  twoFactorRoutes(app, deps.database, sessions.now);

  // Phase 5 / §3: everything comes from the hub itself; the browser may not call out,
  // be framed, or send referrers. SSE replies are hijacked and carry their own headers.
  app.addHook("onSend", async (_request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
  });

  app.setErrorHandler((error: { statusCode?: number; code?: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    request.log.warn({ status, code: error.code }, "request failed");
    if (status === 413) return sendError(reply, "VALIDATION_ERROR", "Request too large");
    if (status >= 400 && status < 500) return sendError(reply, "VALIDATION_ERROR", "Invalid request");
    return sendError(reply, "INTERNAL_ERROR", "Internal error");
  });

  dataRoutes(app, (request) => guard.isValid(request));
  healthRoutes(app, deps);
  privacyRoutes(app, deps);
  chatRoutes(app, deps);

  if (deps.webDist && existsSync(path.join(deps.webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: path.resolve(deps.webDist) });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
      return sendError(reply, "NOT_FOUND", "Not found");
    });
  } else {
    app.setNotFoundHandler((_request, reply) => sendError(reply, "NOT_FOUND", "Not found"));
  }

  return app;
}
