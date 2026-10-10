import { HTTP_STATUS_BY_ERROR_CODE, type ApiErrorCode } from "@innercove/core";
import type { FastifyReply } from "fastify";
import type { ZodError } from "zod";

export function sendError(reply: FastifyReply, code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
  return reply
    .code(HTTP_STATUS_BY_ERROR_CODE[code])
    .send({ error: { code, message, ...(details ? { details } : {}) } });
}

/** Paths and messages only; never echo the submitted values. */
export function validationDetails(error: ZodError) {
  return { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
}
