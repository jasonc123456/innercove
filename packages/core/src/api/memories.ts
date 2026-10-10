/**
 * /api/memories (§3c: "User-written -> `approved` on create; review
 * is only for `ai_proposal` items (D38)"). The review action
 * (approve/reject) is its own sub-resource (`POST
 * /api/memories/:id/review`), separate from the general PATCH, so
 * `status`/`origin` can never be touched by an ordinary field edit.
 */
import { z } from "zod";
import { MemoryIdSchema } from "../types/ids.js";
import {
  MemoryStatusSchema,
  MemoryOriginSchema,
  MemoryRecordSchema,
  MemoryCreateInputSchema,
  MemoryUpdateInputSchema,
  MemoryReviewActionInputSchema,
} from "../types/memory.js";
import { TombstoneRecordSchema } from "../types/tombstone.js";

export const ListMemoriesQuerySchema = z
  .object({
    status: MemoryStatusSchema.optional(),
    origin: MemoryOriginSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: MemoryIdSchema.optional(),
  })
  .strict();
export type ListMemoriesQuery = z.infer<typeof ListMemoriesQuerySchema>;
export const ListMemoriesResponseSchema = z.object({
  memories: z.array(MemoryRecordSchema),
  nextCursor: MemoryIdSchema.nullable(),
});
export type ListMemoriesResponse = z.infer<typeof ListMemoriesResponseSchema>;

export const GetMemoryResponseSchema = MemoryRecordSchema;
export type GetMemoryResponse = z.infer<typeof GetMemoryResponseSchema>;

// POST /api/memories -- status is derived from `origin` server-side
// (see MemoryCreateInputSchema); never a field clients set here.
export const CreateMemoryRequestSchema = MemoryCreateInputSchema;
export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequestSchema>;
export const CreateMemoryResponseSchema = MemoryRecordSchema;
export type CreateMemoryResponse = z.infer<typeof CreateMemoryResponseSchema>;

// PATCH /api/memories/:id -- content/accessLevel only.
export const UpdateMemoryRequestSchema = MemoryUpdateInputSchema;
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;
export const UpdateMemoryResponseSchema = MemoryRecordSchema;
export type UpdateMemoryResponse = z.infer<typeof UpdateMemoryResponseSchema>;

// POST /api/memories/:id/review -- the only path to status="approved"/
// "rejected"; the handler must reject this call against an
// `origin: "user"` memory (already approved at create) with CONFLICT.
export const ReviewMemoryRequestSchema = MemoryReviewActionInputSchema;
export type ReviewMemoryRequest = z.infer<typeof ReviewMemoryRequestSchema>;
export const ReviewMemoryResponseSchema = MemoryRecordSchema;
export type ReviewMemoryResponse = z.infer<typeof ReviewMemoryResponseSchema>;

export const DeleteMemoryResponseSchema = z.object({
  tombstone: TombstoneRecordSchema,
});
export type DeleteMemoryResponse = z.infer<typeof DeleteMemoryResponseSchema>;
