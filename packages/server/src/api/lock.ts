import { SetupRequestSchema, UnlockRequestSchema } from "@innercove/core";
import type { FastifyInstance } from "fastify";
import { DatabaseError, type DatabaseLease, type DatabaseStore } from "../store/db.js";
import { sendError } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest { databaseLease: DatabaseLease | null; databaseHandlerActive: boolean; }
}

// Route AND method, using Fastify's matched route template. HEAD, alternate
// methods and look-alike paths do not inherit exemptions from GET routes.
const LOCKED_ALLOWLIST = new Set([
  "GET /api/health", "GET /api/lock-status", "POST /api/setup", "POST /api/unlock",
]);

export function databaseRoutes(app: FastifyInstance, database: DatabaseStore) {
  app.decorateRequest("databaseLease", null);
  app.decorateRequest("databaseHandlerActive", false);
  // A disconnected client can leave its async handler still running.
  // Keep the connection alive until that handler settles, including SSE.
  app.addHook("onRoute", (route) => {
    const handler = route.handler;
    route.handler = function (request, reply) {
      request.databaseHandlerActive = true;
      const complete = () => {
        request.databaseHandlerActive = false;
        request.databaseLease?.release();
      };
      try {
        const result = handler.call(this, request, reply);
        if (result && typeof (result as { then?: unknown }).then === "function") {
          return Promise.resolve(result).finally(complete);
        }
        complete();
        return result;
      } catch (error) {
        complete();
        throw error;
      }
    };
  });
  app.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split("?")[0]!;
    const isApi = (p: string) => p === "/api" || p.startsWith("/api/");
    if (!isApi(route) && !isApi(request.url.split("?")[0]!)) return;
    if (LOCKED_ALLOWLIST.has(`${request.method} ${route}`)) return;
    if (database.locked) return sendError(reply, "LOCKED", "Database is locked");
    // Lock itself cannot hold the lease it waits to drain.
    if (request.method === "POST" && route === "/api/lock") return;
    const lease = database.acquire();
    request.databaseLease = lease;
    const release = () => {
      if (!request.databaseHandlerActive) lease.release();
      reply.raw.off("finish", release);
      reply.raw.off("close", release);
      request.raw.off("aborted", release);
    };
    reply.raw.once("finish", release);
    reply.raw.once("close", release);
    request.raw.once("aborted", release);
  });
  // onResponse is a backstop for injection and ordinary replies; release is
  // idempotent. Raw finish/close also covers A's hijacked SSE responses.
  app.addHook("onResponse", async (request) => { if (!request.databaseHandlerActive) request.databaseLease?.release(); });
  app.addHook("onClose", async () => { await database.shutdown(); });

  app.get("/api/lock-status", async () => database.status);

  app.post("/api/setup", async (request, reply) => {
    const parsed = SetupRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid setup request");
    try {
      await database.setup(parsed.data.passphrase);
      return reply.code(201).send({ locked: false });
    } catch (error) { return lifecycleError(reply, error); }
  });

  app.post("/api/unlock", async (request, reply) => {
    const parsed = UnlockRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid unlock request");
    try {
      await database.unlock(parsed.data.passphrase);
      return { locked: false };
    } catch (error) { return lifecycleError(reply, error); }
  });

  app.post("/api/lock", async (request, reply) => {
    if (request.body !== undefined && request.body !== null) return sendError(reply, "VALIDATION_ERROR", "Lock has no request body");
    try {
      await database.lock();
      return { locked: true };
    } catch (error) { return lifecycleError(reply, error); }
  });
}

function lifecycleError(reply: import("fastify").FastifyReply, error: unknown) {
  if (error instanceof DatabaseError) {
    if (error.retryAfterSeconds !== undefined) reply.header("Retry-After", error.retryAfterSeconds);
    return sendError(reply, error.code, error.message);
  }
  return sendError(reply, "INTERNAL_ERROR", "Database operation failed");
}
