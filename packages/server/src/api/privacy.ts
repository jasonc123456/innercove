import { PrivacyStatusSchema } from "@innercove/core";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { systemInfo } from "../system.js";

/** `GET /api/privacy-status` (plan §3c). Locked like every other route (D26). B: encryption and path; A: the rest. */
export function privacyRoutes(app: FastifyInstance, deps: AppDeps) {
  const system = deps.system ?? systemInfo({ INFERENCE_PROVIDER: "fake" });
  app.get("/api/privacy-status", async () =>
    PrivacyStatusSchema.parse({
      locked: deps.database.locked,
      // main.ts refuses to start with anything but SQLCipher (no plaintext fallback, D26).
      encryption: "sqlcipher",
      dataPath: deps.database.dataPath,
      model: { id: deps.provider.modelId, endpointClass: system.endpointClass },
      acceleration: system.acceleration,
      memoryUsedGb: system.memoryUsedGb(),
      lastReply: deps.stats.lastReply,
    }),
  );
}
