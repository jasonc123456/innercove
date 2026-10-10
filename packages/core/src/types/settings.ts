/**
 * P0 settings and privacy-status data owned by B, per §3c's route
 * table: "`GET/PATCH /api/settings` | Includes `useMemoriesDefault`
 * (saved chats `true`, D37) and `diaryDefaultAccessLevel` (`"private"`)"
 * and "`GET /api/privacy-status` | -> { locked, encryption, dataPath,
 * model, acceleration, memoryUsedGb, lastReply } | B (encryption,
 * path), A (the rest)".
 *
 * `hasPassphrase` moved OUT of this file to unlock.ts's
 * `LockStatusResponseSchema` -- §3c's `GET /api/lock-status` is where
 * it's actually read from (`{ hasPassphrase, locked }`), and settings
 * has no reason to duplicate it.
 */
import { z } from "zod";
import { UserIdSchema } from "./ids.js";
import { AccessLevelSchema } from "./access.js";

export const UserSettingsRecordSchema = z.object({
  userId: UserIdSchema,
  /** Default for the "Use memories" toggle on a NEW saved chat (D37:
   * true for saved chats). Temporary chats have their own separate
   * default (false) on `/api/infer`'s own request shape -- owned by
   * A, not read from here. */
  useMemoriesDefault: z.boolean(),
  /** Default accessLevel a NEW diary entry gets when its create
   * request omits `accessLevel` (D36: `"private"`). */
  diaryDefaultAccessLevel: AccessLevelSchema,
  updatedAt: z.string().datetime(),
});
export type UserSettingsRecord = z.infer<typeof UserSettingsRecordSchema>;

/** No `.default()` on any field -- an omitted key during a settings
 * update must leave the stored value untouched. `.strict()`. */
export const UserSettingsUpdateInputSchema = z
  .object({
    useMemoriesDefault: z.boolean().optional(),
    diaryDefaultAccessLevel: AccessLevelSchema.optional(),
  })
  .strict();
export type UserSettingsUpdateInput = z.infer<typeof UserSettingsUpdateInputSchema>;

/** `GET /api/privacy-status`. No `userId`/list shape -- §3c specifies
 * this as a single, whole-process status object (there is one seeded
 * user and one hub), not a per-record type. B supplies `encryption`
 * and `dataPath`; A supplies `model`/`acceleration`/`memoryUsedGb`/
 * `lastReply` (still defined here since it's one combined response
 * shape, per the route table's single entry). */
export const PrivacyStatusSchema = z.object({
  locked: z.boolean(),
  /** "OFF" must be reported honestly when the SQLCipher build failed
   * and the `DB_ENCRYPTION=off` emergency switch (D26) is active --
   * never silently claimed as encrypted. */
  encryption: z.enum(["sqlcipher", "off"]),
  dataPath: z.string(),
  model: z.object({
    id: z.string(),
    endpointClass: z.enum(["loopback", "lan", "public"]),
  }),
  acceleration: z.enum(["cuda", "vulkan", "cpu", "unknown"]),
  memoryUsedGb: z.number().nonnegative().nullable(),
  lastReply: z
    .object({
      firstWordMs: z.number().nonnegative(),
      tokPerS: z.number().nonnegative(),
    })
    .nullable(),
});
export type PrivacyStatus = z.infer<typeof PrivacyStatusSchema>;
