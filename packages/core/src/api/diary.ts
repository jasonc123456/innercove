/** /api/diary (§3c: "`GET/POST/PATCH/DELETE /api/diary[/:id]`, `GET
 * /api/diary?q=` (FTS)"). */
import { z } from "zod";
import { DiaryEntryIdSchema } from "../types/ids.js";
import { DiaryEntryRecordSchema, DiaryEntryCreateInputSchema, DiaryEntryUpdateInputSchema } from "../types/diary.js";
import { TombstoneRecordSchema } from "../types/tombstone.js";

export const ListDiaryEntriesQuerySchema = z
  .object({
    /** FTS5 query string; omitted => plain recency-ordered listing. */
    q: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: DiaryEntryIdSchema.optional(),
  })
  .strict();
export type ListDiaryEntriesQuery = z.infer<typeof ListDiaryEntriesQuerySchema>;
export const ListDiaryEntriesResponseSchema = z.object({
  entries: z.array(DiaryEntryRecordSchema),
  nextCursor: DiaryEntryIdSchema.nullable(),
});
export type ListDiaryEntriesResponse = z.infer<typeof ListDiaryEntriesResponseSchema>;

export const GetDiaryEntryResponseSchema = DiaryEntryRecordSchema;
export type GetDiaryEntryResponse = z.infer<typeof GetDiaryEntryResponseSchema>;

export const CreateDiaryEntryRequestSchema = DiaryEntryCreateInputSchema;
// `z.input`, not `z.infer`/`z.output`: this schema applies the
// includeInHandoff default via `.transform` (diary.ts).
export type CreateDiaryEntryRequest = z.input<typeof CreateDiaryEntryRequestSchema>;
export const CreateDiaryEntryResponseSchema = DiaryEntryRecordSchema;
export type CreateDiaryEntryResponse = z.infer<typeof CreateDiaryEntryResponseSchema>;

export const UpdateDiaryEntryRequestSchema = DiaryEntryUpdateInputSchema;
export type UpdateDiaryEntryRequest = z.infer<typeof UpdateDiaryEntryRequestSchema>;
export const UpdateDiaryEntryResponseSchema = DiaryEntryRecordSchema;
export type UpdateDiaryEntryResponse = z.infer<typeof UpdateDiaryEntryResponseSchema>;

export const DeleteDiaryEntryResponseSchema = z.object({
  tombstone: TombstoneRecordSchema,
});
export type DeleteDiaryEntryResponse = z.infer<typeof DeleteDiaryEntryResponseSchema>;
