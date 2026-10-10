import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export function healthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/health", async () => {
    const model = await deps.provider.health();
    const locked = deps.database.locked;
    return { status: "ok", locked, model: { id: model.modelId, reachable: model.reachable } };
  });
}
