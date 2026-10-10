import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { InferenceProvider } from "../core/inference/index.js";
import type { ReplyStats } from "./chat/turn.js";
import { sendError } from "./errors.js";
import { chatRoutes } from "./routes/chat.js";
import { healthRoutes } from "./routes/health.js";

export interface AppDeps {
  provider: InferenceProvider;
  systemPrompt: string;
  /** Speed of the last reply, for the privacy panel (plan §3c, A's fields). In memory only. */
  stats: { lastReply: ReplyStats | null };
  isLocked?: () => boolean;
  webDist?: string;
}

export async function buildApp(deps: AppDeps, logger: FastifyServerOptions["logger"] = true) {
  // Fastify logs method, URL and status only; request and response bodies are never logged.
  const app = Fastify({ logger, bodyLimit: 256 * 1024 });

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
