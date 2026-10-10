import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ChatRequestSchema, InferRequestSchema } from "@innercove/core";
import type { ChatMessage } from "../inference/index.js";
import { runTurn } from "../chat/turn.js";
import type { AppDeps } from "../app.js";
import { sendError, validationDetails } from "./errors.js";
import { openSse } from "./sse.js";

export function chatRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Saved chats. Phase 1: no store yet, so only new conversations and no persistence. */
  app.post("/api/chat", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid chat request", validationDetails(parsed.error));
    if (parsed.data.conversationId !== null) return sendError(reply, "NOT_FOUND", "Conversation not found");
    return stream(request, reply, deps, [], parsed.data.message);
  });

  /** Temporary chats (D35): history comes from the browser; never writes rows or content logs. */
  app.post("/api/infer", async (request, reply) => {
    const parsed = InferRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, "VALIDATION_ERROR", "Invalid infer request", validationDetails(parsed.error));
    return stream(request, reply, deps, parsed.data.history, parsed.data.message);
  });
}

async function stream(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AppDeps,
  history: ChatMessage[],
  message: string,
) {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  reply.hijack();
  const send = openSse(reply.raw);
  const stats = await runTurn({
    provider: deps.provider,
    safety: deps.safety,
    systemPrompt: deps.systemPrompt,
    history,
    message,
    signal: controller.signal,
    send,
    onScreenBlock: (tier, reasons) => request.log.info({ event: "output_screened", tier, reasons }, "output screen blocked a reply"),
  });
  if (stats) deps.stats.lastReply = stats;
  if (controller.signal.aborted) request.log.info("chat stream aborted by client");
  reply.raw.end();
}
