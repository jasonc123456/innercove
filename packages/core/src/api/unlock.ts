/**
 * Lock/unlock routes (§3c). The passphrase must never be echoed or
 * logged -- enforced here two ways: (1) no response schema below has a
 * field that could carry it back, (2) `UNLOGGABLE_REQUEST_FIELDS` names
 * the request field a logging middleware must redact before
 * serializing these request shapes. Zod validation cannot stop a
 * handler from calling `console.log(req.body)` directly; this is a
 * contract-level guardrail, not a runtime guarantee.
 *
 * Revised per §3c (supersedes this package's first draft): the draft's
 * single `/api/unlock` + ad hoc "SetPassphrase" pair is replaced by the
 * four routes §3c actually names, with their actual response shapes
 * (`{ locked: false }`, not `{ unlocked: true, unlockedAt }`).
 */
import { z } from "zod";

export const UNLOGGABLE_REQUEST_FIELDS = ["passphrase"] as const;

/** `GET /api/lock-status` -- one of the four routes reachable while
 * locked (§3c's Lock rule: "no read exemptions" beyond these four). */
export const LockStatusResponseSchema = z.object({
  hasPassphrase: z.boolean(),
  locked: z.boolean(),
});
export type LockStatusResponse = z.infer<typeof LockStatusResponseSchema>;

/** `POST /api/setup` -- first-time passphrase setup, a distinct action
 * from unlocking with an existing one. `201 { locked: false }` on
 * success; `409` (via ApiErrorResponseSchema, code CONFLICT) if a
 * passphrase is already set. */
export const SetupRequestSchema = z.object({ passphrase: z.string().min(8) }).strict();
export type SetupRequest = z.infer<typeof SetupRequestSchema>;
export const SetupResponseSchema = z.object({ locked: z.literal(false) });
export type SetupResponse = z.infer<typeof SetupResponseSchema>;

/** `POST /api/unlock`. Wrong passphrase -> `401` (ApiErrorResponseSchema,
 * code UNAUTHORIZED); §3c's "30s delay after 5 failures" is a handler-
 * side rate-limit behavior, not a field on either schema here -- it
 * would surface, if at all, through the error response's own
 * `details`, which this package deliberately leaves unshaped (see
 * api/errors.ts's own comment on `details` never echoing request
 * state). */
export const UnlockRequestSchema = z.object({ passphrase: z.string().min(1) }).strict();
export type UnlockRequest = z.infer<typeof UnlockRequestSchema>;
export const UnlockResponseSchema = z.object({ locked: z.literal(false) });
export type UnlockResponse = z.infer<typeof UnlockResponseSchema>;

/** `POST /api/lock` -- no request body. Wipes the key from server
 * memory (a server-process concern; nothing here represents a "key"
 * at all, so there's nothing to leak back by construction). */
export const LockResponseSchema = z.object({ locked: z.literal(true) });
export type LockResponse = z.infer<typeof LockResponseSchema>;
