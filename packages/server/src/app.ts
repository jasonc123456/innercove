import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { InferenceProvider } from "./inference/index.js";
import type { ChatStore } from "./chat/ports.js";
import type { SafetyLayer } from "./chat/safety.js";
import type { ReplyStats } from "./chat/turn.js";
import { sendError } from "./api/errors.js";
import { chatRoutes } from "./api/chat.js";
import { healthRoutes } from "./api/health.js";
import { databaseRoutes } from "./api/lock.js";
import type { DatabaseStore } from "./store/db.js";

export interface AppDeps {
  provider: InferenceProvider;
  safety: SafetyLayer;
  systemPrompt: string;
  /** Speed of the last reply, for the privacy panel (plan §3c, A's fields). In memory only. */
  stats: { lastReply: ReplyStats | null };
  database: DatabaseStore;
  /** B's store (Phase 2), or the in-memory dev store. Without it, chats have no memories and nothing is saved. */
  store?: ChatStore;
  webDist?: string;
}

export async function buildApp(deps: AppDeps, logger: FastifyServerOptions["logger"] = true) {
  // Fastify logs method, URL and status only; request and response bodies are never logged.
  const app = Fastify({ bodyLimit: 256 * 1024, logger: logger === false ? false : {
    ...(typeof logger === "object" ? logger : {}),
    serializers: {
      req: (request: { method: string; url: string }) => ({ method: request.method, url: request.url.split("?")[0]! }),
    },
  } });
  databaseRoutes(app, deps.database);

  app.setErrorHandler((error: { statusCode?: number; code?: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    request.log.warn({ status, code: error.code }, "request failed");
    if (status === 413) return sendError(reply, "VALIDATION_ERROR", "Request too large");
    if (status >= 400 && status < 500) return sendError(reply, "VALIDATION_ERROR", "Invalid request");
    return sendError(reply, "INTERNAL_ERROR", "Internal error");
  });

  healthRoutes(app, deps);
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
