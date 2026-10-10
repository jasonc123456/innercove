/**
 * /api/settings, /api/privacy-status (§3c). NOT locked-exempt: §3c's
 * Lock rule is explicit ("There are no read exemptions" beyond
 * `/api/health`, `/api/lock-status`, `/api/setup`, `/api/unlock") --
 * this package's first draft wrongly assumed settings was reachable
 * while locked; it returns `423` like every other route B owns.
 */
import { z } from "zod";
import { UserSettingsRecordSchema, UserSettingsUpdateInputSchema, PrivacyStatusSchema } from "../types/settings.js";

export const GetSettingsResponseSchema = UserSettingsRecordSchema;
export type GetSettingsResponse = z.infer<typeof GetSettingsResponseSchema>;

export const UpdateSettingsRequestSchema = UserSettingsUpdateInputSchema;
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
export const UpdateSettingsResponseSchema = UserSettingsRecordSchema;
export type UpdateSettingsResponse = z.infer<typeof UpdateSettingsResponseSchema>;

export const GetPrivacyStatusResponseSchema = PrivacyStatusSchema;
export type GetPrivacyStatusResponse = z.infer<typeof GetPrivacyStatusResponseSchema>;
