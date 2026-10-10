/**
 * One consistent error shape across every B-owned endpoint. HTTP status
 * codes are not part of the Zod contract (that's a transport-layer
 * mapping, listed in HTTP_STATUS_BY_ERROR_CODE below for reference), but
 * `code` is a closed enum every handler must pick from -- "LOCKED" is
 * the code a 423 response always carries.
 */
import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "LOCKED",
  "INTERNAL_ERROR",
  "MODEL_UNAVAILABLE",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    /** Structured extra detail for VALIDATION_ERROR (e.g. per-field zod
     * issues). Deliberately `z.record(z.unknown())`, never a pass-through
     * of the original request body -- a handler must build this from
     * validation issues, not forward client input verbatim (the same
     * discipline as "do not echo the passphrase", generalized: never
     * echo a raw request body into an error response at all, since some
     * future endpoint's body could carry something just as sensitive). */
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// §3c: "VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND
// 404, CONFLICT 409, LOCKED 423, INTERNAL_ERROR 500 and MODEL_UNAVAILABLE
// 503." MODEL_UNAVAILABLE is A's to raise (e.g. the SSE `error` event
// when LM Studio is unreachable); the shared enum/status map lives here
// since B owns every schema in this package, including the error shape
// A's routes also return.
export const HTTP_STATUS_BY_ERROR_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  INTERNAL_ERROR: 500,
  MODEL_UNAVAILABLE: 503,
};
