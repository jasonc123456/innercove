import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { DiaryEntryCreateInputSchema, MemoryCreateInputSchema } from "@innercove/core";
import { DatabaseError, type DatabaseLease } from "./db.js";
import { conversations, diaryEntries, memories, messages, messageContext, provenance, tombstones, checkInEvents, dailyCheckIns } from "./schema.js";
import { DiaryRepository } from "./repos/diary.js";
import { MemoryRepository } from "./repos/memories.js";

const templateSchema = z.object({
  memories: z.array(z.object({ content: z.string().min(1), accessLevel: z.enum(["private", "ai_eligible"]) }).strict()).min(1),
  diaryEntries: z.array(z.object({ date: z.iso.date(), title: z.string(), mood: z.number(), tags: z.array(z.string()), origin: z.literal("manual"), accessLevel: z.enum(["private", "ai_eligible"]), content: z.string() }).strict()).min(1),
}).passthrough(); // Existing template also has metadata and live-demo instructions, never seeded.

/** D's existing fictional template only; explicit CLI invocation, never startup.
 * Reject nonempty content rather than overwrite, deduplicate or silently reset.
 * Caller owns a dedicated offline encrypted connection and releases its lease. */
export function seedFictionalPersona(lease: DatabaseLease, input: unknown) {
  const template = templateSchema.parse(input);
  // Validate all rows before any mutation; preserve the file's access choices.
  const memoryInputs = template.memories.map(m => MemoryCreateInputSchema.parse({ ...m, origin: "user", sources: [{ sourceType: "manual", sourceId: null }] }));
  const diaryInputs = template.diaryEntries.map(({ date, ...d }) => ({ at: `${date}T12:00:00.000Z`, input: DiaryEntryCreateInputSchema.parse(d) }));
  return lease.db.transaction(() => {
    for (const table of [conversations, messages, diaryEntries, memories, provenance, messageContext, tombstones, checkInEvents, dailyCheckIns]) {
      if (lease.orm.select({ n: count() }).from(table).where(eq(table.userId, lease.userId)).get()!.n) {
        throw new DatabaseError("CONFLICT", "Demo seed requires an empty content store");
      }
    }
    const memoryRepo = new MemoryRepository(lease);
    const diaryRepo = new DiaryRepository(lease);
    for (const input of memoryInputs) memoryRepo.create(lease.userId, input);
    for (const { at, input } of diaryInputs) {
      const record = diaryRepo.create(lease.userId, input);
      lease.orm.update(diaryEntries).set({ createdAt: at, updatedAt: at }).where(and(eq(diaryEntries.userId, lease.userId), eq(diaryEntries.id, record.id))).run();
    }
    return { memories: memoryInputs.length, diaryEntries: diaryInputs.length };
  })();
}
