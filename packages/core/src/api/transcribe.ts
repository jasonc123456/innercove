import { z } from "zod";

/** POST /api/transcribe takes raw bytes, not JSON or multipart. */
export const TRANSCRIPTION_MAX_BYTES = 4 * 1024 * 1024;
export const TRANSCRIPTION_MAX_SECONDS = 60;
export const TranscriptionMediaTypeSchema = z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]);
export type TranscriptionMediaType = z.infer<typeof TranscriptionMediaTypeSchema>;
export const TranscriptionResponseSchema = z.object({
  text: z.string().trim().min(1).max(16000),
  durationMs: z.number().positive().max(60000),
}).strict();
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
