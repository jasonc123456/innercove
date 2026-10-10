import type { FastifyReply } from "fastify";
import type { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LOCKED"
  | "INTERNAL_ERROR"
  | "MODEL_UNAVAILABLE";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  INTERNAL_ERROR: 500,
  MODEL_UNAVAILABLE: 503,
};

export function sendError(reply: FastifyReply, code: ErrorCode, message: string, details?: unknown) {
  return reply.code(STATUS[code]).send({ error: { code, message, ...(details ? { details } : {}) } });
}

/** Paths and messages only; never echo the submitted values. */
export function validationDetails(error: ZodError) {
  return { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
}
