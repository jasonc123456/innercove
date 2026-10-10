/**
 * POST /api/delete-all (§3c/D39): "`{ confirm: "DELETE" }` -> `{
 * deleted: { conversations, diaryEntries, memories } }`; content only
 * (D39)." D39: "keeps the passphrase, settings and paired devices."
 * The literal confirmation string is required so a client can never
 * trigger this by sending an empty/default body.
 */
import { z } from "zod";

export const DeleteAllRequestSchema = z.object({ confirm: z.literal("DELETE") }).strict();
export type DeleteAllRequest = z.infer<typeof DeleteAllRequestSchema>;

export const DeleteAllResponseSchema = z.object({
  deleted: z.object({
    conversations: z.number().int().nonnegative(),
    diaryEntries: z.number().int().nonnegative(),
    memories: z.number().int().nonnegative(),
  }),
});
export type DeleteAllResponse = z.infer<typeof DeleteAllResponseSchema>;
