import { z } from "zod";
import { CHECK_IN_MOOD_IDS, type DailyCheckIn, type CheckInsResponse } from "../tree-growth.js";
export type { DailyCheckIn, CheckInsResponse, CheckInMood } from "../tree-growth.js";
export const CheckInMoodSchema = z.enum(CHECK_IN_MOOD_IDS);
export const CheckInTimeZoneSchema = z.string().min(1).max(100).refine(zone => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
});
export const ListCheckInsQuerySchema = z.object({ timeZone: CheckInTimeZoneSchema }).strict();
export const SaveCheckInRequestSchema = z.object({ eventId: z.uuid(), mood: CheckInMoodSchema, timeZone: CheckInTimeZoneSchema }).strict();
export const AcknowledgeTreeRequestSchema = z.object({ stage: z.union([z.literal(1), z.literal(2), z.literal(3)]), timeZone: CheckInTimeZoneSchema }).strict();
export const DailyCheckInSchema: z.ZodType<DailyCheckIn> = z.object({ day: z.iso.date(), mood: CheckInMoodSchema, timeZone: CheckInTimeZoneSchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const CheckInsResponseSchema: z.ZodType<CheckInsResponse> = z.object({ days: z.array(DailyCheckInSchema), today: z.iso.date(), stage: z.union([z.literal(1), z.literal(2), z.literal(3)]), acknowledgedStage: z.number().int().min(1).max(3), pendingStage: z.union([z.literal(2), z.literal(3), z.null()]) });
export type SaveCheckInRequest = z.infer<typeof SaveCheckInRequestSchema>;
