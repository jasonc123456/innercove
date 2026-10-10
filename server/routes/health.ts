import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export function healthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/health", async () => {
    const model = await deps.provider.health();
    // Phase 2 replaces this with the store's lock state (D26).
    const locked = deps.isLocked?.() ?? false;
    return { status: "ok", locked, model: { id: model.modelId, reachable: model.reachable } };
  });
}
