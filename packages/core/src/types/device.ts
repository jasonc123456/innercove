/**
 * §3c doesn't redefine `devices` (P1-only, unused until phone pairing
 * starts) -- this shape is this package's own default, unchanged from
 * the first draft except for the `userId` rename. See README.md.
 */
import { z } from "zod";
import { UserIdSchema, DeviceIdSchema } from "./ids.js";

export const DevicePlatformSchema = z.enum(["ios", "android", "web", "desktop"]);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const DeviceRecordSchema = z.object({
  id: DeviceIdSchema,
  userId: UserIdSchema,
  label: z.string().min(1).max(100),
  platform: DevicePlatformSchema,
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** null while active; set once, never cleared back to null -- a
   * revoked device cannot be "un-revoked" by this schema (re-pairing is
   * a new Device row, not a resurrected old one). */
  revokedAt: z.string().datetime().nullable(),
});
export type DeviceRecord = z.infer<typeof DeviceRecordSchema>;

export const DeviceCreateInputSchema = z
  .object({
    label: z.string().min(1).max(100),
    platform: DevicePlatformSchema,
  })
  .strict();
export type DeviceCreateInput = z.infer<typeof DeviceCreateInputSchema>;

/** Only the label is ordinarily editable. Revocation is a dedicated
 * action (`DeviceRevokeInputSchema`), not a field a generic patch could
 * accidentally clear by omission. */
export const DeviceUpdateInputSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
  })
  .strict();
export type DeviceUpdateInput = z.infer<typeof DeviceUpdateInputSchema>;

export const DeviceRevokeInputSchema = z
  .object({
    deviceId: DeviceIdSchema,
  })
  .strict();
export type DeviceRevokeInput = z.infer<typeof DeviceRevokeInputSchema>;
