import { TranscriptionMediaTypeSchema, TranscriptionResponseSchema, TRANSCRIPTION_MAX_BYTES } from "@innercove/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendError } from "./errors.js";
import { configuredTranscriber, invalidAudio, TranscriptionError, type Transcriber } from "./transcribe-runtime.js";

/** Existing global DB/session guards apply; no locked/loopback exemptions. */
export function transcriptionRoutes(app: FastifyInstance, adapter: Transcriber = configuredTranscriber(), timeoutMs = 90000, uploadTimeoutMs = 15000, hasValidSession: (request: FastifyRequest) => boolean = () => false) {
  void app.register(async scoped => {
    scoped.addContentTypeParser(/^audio\//, { parseAs: "buffer", bodyLimit: TRANSCRIPTION_MAX_BYTES }, (_request, body, done) => done(null, body));
    let busy = false;
    const controllers = new Set<AbortController>();
    const states = new WeakMap<FastifyRequest, { controller: AbortController; timer: NodeJS.Timeout; started: boolean; release: () => void }>();
    scoped.addHook("preClose", async () => { for (const controller of controllers) controller.abort(); });
    scoped.addHook("onResponse", async request => { const state = states.get(request); if (state && !state.started) state.release(); });
    scoped.post("/api/transcribe", {
      bodyLimit: TRANSCRIPTION_MAX_BYTES,
      onRequest: async (request, reply) => {
        if (!hasValidSession(request)) return sendError(reply, "UNAUTHORIZED", "Sign-in required");
        if (busy) return sendError(reply, "CONFLICT", "Transcription is busy");
        busy = true;
        const controller = new AbortController(); controllers.add(controller);
        let released = false;
        const release = () => {
          if (released) return; released = true;
          clearTimeout(timer); busy = false; controllers.delete(controller);
        };
        const timer = setTimeout(() => { controller.abort(); request.raw.destroy(); release(); }, uploadTimeoutMs);
        const state = { controller, timer, started: false, release }; states.set(request, state);
        controller.signal.addEventListener("abort", () => { if (!state.started) { request.raw.destroy(); release(); } }, { once: true });
        request.raw.once("aborted", () => { controller.abort(); if (!state.started) release(); });
        reply.raw.once("close", () => { controller.abort(); if (!state.started) release(); });
      },
    }, async (request, reply) => {
      const state = states.get(request)!; state.started = true; clearTimeout(state.timer);
      const { controller } = state;
      const type = TranscriptionMediaTypeSchema.safeParse(request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase());
      if (!type.success || !Buffer.isBuffer(request.body) || !request.body.length || request.body.length > TRANSCRIPTION_MAX_BYTES || Object.keys(request.query as object).length) {
        state.release(); return sendError(reply, "VALIDATION_ERROR", "Invalid audio upload");
      }
      const timedOut = new TranscriptionError("MODEL_UNAVAILABLE", "Transcription timed out or cancelled");
      let rejectAbort!: (error: Error) => void;
      const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
      const abort = () => rejectAbort(timedOut);
      controller.signal.addEventListener("abort", abort, { once: true });
      const deadline = setTimeout(() => controller.abort(), timeoutMs);
      // Admission stays busy until adapter cleanup settles, even if a faulty
      // adapter ignores cancellation. The request/DB lease still has a deadline.
      const work = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw timedOut;
        return adapter.transcribe(request.body as Buffer, type.data, controller.signal);
      }).finally(state.release);
      try {
        if (controller.signal.aborted) throw timedOut;
        const result = await Promise.race([work, interrupted]);
        const parsed = TranscriptionResponseSchema.safeParse(result);
        if (!parsed.success) throw invalidAudio();
        return parsed.data;
      } catch (error) {
        if (error instanceof TranscriptionError) return sendError(reply, error.code, error.message);
        return sendError(reply, "MODEL_UNAVAILABLE", "Local transcription failed");
      } finally {
        clearTimeout(deadline); controller.signal.removeEventListener("abort", abort);
      }
    });
  });
}
