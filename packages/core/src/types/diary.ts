/**
 * Diary entries -- kept separate from chat (see conversation.ts).
 *
 * Revised per §3c's data model: `origin` is `manual | excerpt |
 * ai_draft | support_note` (was `user_written | support_note` in this
 * package's first draft -- `manual` replaces `user_written`, and
 * `excerpt`/`ai_draft` are added for P0 #5 "saving selected chat
 * messages to the diary as an excerpt" and the P1 AI-draft flow).
 * `accessLevel` defaults to private when omitted, for every origin --
 * but via two DIFFERENT mechanisms, not one: an ordinary entry
 * (manual/excerpt/ai_draft) inherits the user's configurable
 * `settings.diaryDefaultAccessLevel` (D36, itself `"private"` until
 * changed -- resolved by the HANDLER, not this schema); a
 * `support_note` is forced to the literal `"private"` directly in this
 * schema's own `.transform`, independent of that setting (D30's
 * stronger, note-specific guarantee -- see the create-input comment
 * below). An explicit `accessLevel` on either kind is always respected
 * as given.
 */
import { z } from "zod";
import { UserIdSchema, DiaryEntryIdSchema } from "./ids.js";
import { AccessLevelSchema } from "./access.js";
import { ProvenanceSourceRefSchema } from "./provenance.js";

export const DiaryEntryOriginSchema = z.enum(["manual", "excerpt", "ai_draft", "support_note"]);
export type DiaryEntryOrigin = z.infer<typeof DiaryEntryOriginSchema>;

/** Free-text tags -- §3c says only "add ... `tags`" with no further
 * shape; a deduped array of short, non-empty strings is this
 * package's chosen default (see README.md). */
export const DiaryTagsSchema = z.array(z.string().min(1).max(40)).max(20);

/** 1-5 mood rating (§3c: "mood (1–5)"); `null` when the entry doesn't
 * record one -- not every entry needs a mood value. */
export const MoodSchema = z.number().int().min(1).max(5).nullable();

export const DiaryEntryRecordSchema = z.object({
  id: DiaryEntryIdSchema,
  userId: UserIdSchema,
  origin: DiaryEntryOriginSchema,
  title: z.string().max(200).nullable(),
  content: z.string().min(1),
  accessLevel: AccessLevelSchema,
  /** §3c: "add `includeInHandoff`". Defaults per §3's own sketch: a
   * support note defaults to `true` (it exists specifically to be
   * handed to a counselor, D30); every other origin defaults to
   * `false` (the user opts a regular entry in explicitly). See the
   * create-input transform below for where that default is applied. */
  includeInHandoff: z.boolean(),
  tags: DiaryTagsSchema,
  mood: MoodSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DiaryEntryRecord = z.infer<typeof DiaryEntryRecordSchema>;

/** Raw client input before origin-based defaults are applied -- kept
 * separate from `DiaryEntryCreateInputSchema` so the default-filling
 * step (a `.transform`/`.superRefine`, not a `.default()` on the field
 * itself) is one explicit, auditable step. `.strict()`. */
const DiaryEntryCreateRawInputSchema = z
  .object({
    origin: DiaryEntryOriginSchema,
    title: z.string().max(200).nullable().optional(),
    content: z.string().min(1),
    /** Omitted on a NON-support-note entry => the HANDLER fills in the
     * user's current `settings.diaryDefaultAccessLevel` (itself
     * `"private"` until the user changes it, D36) -- this package has
     * no settings lookup to do that itself at parse time, so it
     * deliberately leaves this `undefined` rather than hardcoding the
     * literal "private" here.
     *
     * A `support_note` is DIFFERENT (D30: "the AI doesn't use it in
     * later chats unless the user switches that on per note" -- a
     * stronger, note-specific guarantee than D36's general, user-
     * configurable default): when omitted, it is forced to `"private"`
     * directly in the `.transform` below, REGARDLESS of whatever
     * `diaryDefaultAccessLevel` currently is -- even if the user has
     * changed that general setting to `"ai_eligible"`. An EXPLICIT
     * value on a support note (the user deliberately switching access
     * on for that one note) is still always respected as-is; only the
     * no-value-given case is forced. */
    accessLevel: AccessLevelSchema.optional(),
    includeInHandoff: z.boolean().optional(),
    tags: DiaryTagsSchema.optional(),
    mood: MoodSchema.optional(),
    /** Required (>=1) when `origin === "excerpt"`: which message(s)
     * the excerpt was saved from (see the superRefine below). Absent
     * for every other origin -- `manual`/`ai_draft`/`support_note`
     * entries aren't excerpted FROM a message the same way (an
     * `ai_draft` may still cite messages later via a separate flow;
     * out of scope for P0). This is this package's own chosen shape
     * for "saving a chat excerpt" (§3c's route table has no distinct
     * endpoint for it) -- see README.md's flagged ambiguity. */
    sources: z.array(ProvenanceSourceRefSchema).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.origin === "excerpt" && (!input.sources || input.sources.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An "excerpt" diary entry requires at least one source in `sources`',
        path: ["sources"],
      });
    }
  });
export type DiaryEntryCreateRawInput = z.infer<typeof DiaryEntryCreateRawInputSchema>;

export const DiaryEntryCreateInputSchema = DiaryEntryCreateRawInputSchema.transform((input) => ({
  ...input,
  // D30: an omitted accessLevel on a support note is forced private,
  // independent of settings.diaryDefaultAccessLevel (D36) -- see the
  // field comment above. Every other origin is left untouched
  // (`undefined` stays `undefined`) for the handler to resolve against
  // that setting, exactly as before this fix.
  accessLevel: input.accessLevel ?? (input.origin === "support_note" ? "private" : undefined),
  includeInHandoff: input.includeInHandoff ?? input.origin === "support_note",
}));
/** The shape a CLIENT sends (pre-default; `z.input`, not `z.infer`/
 * `z.output`). */
export type DiaryEntryCreateInput = z.input<typeof DiaryEntryCreateInputSchema>;
/** The shape after the includeInHandoff default has been applied. */
export type DiaryEntryCreateOutput = z.output<typeof DiaryEntryCreateInputSchema>;

/** Update input: `origin` and `sources` are never editable here (an
 * excerpt's provenance doesn't change after the fact); no `.default()`
 * anywhere so omitting a field never resets it. `.strict()`. */
export const DiaryEntryUpdateInputSchema = z
  .object({
    title: z.string().max(200).nullable().optional(),
    content: z.string().min(1).optional(),
    accessLevel: AccessLevelSchema.optional(),
    includeInHandoff: z.boolean().optional(),
    tags: DiaryTagsSchema.optional(),
    mood: MoodSchema.optional(),
  })
  .strict();
export type DiaryEntryUpdateInput = z.infer<typeof DiaryEntryUpdateInputSchema>;

/** The shape A reads diary candidates in as -- see
 * data-layer/index.ts's DiaryMemoryReadPort for the eligibility
 * contract this type is returned under. */
export type DiaryEntryCandidate = DiaryEntryRecord;
