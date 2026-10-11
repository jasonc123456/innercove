export type SupportNoteInput = {
  title: string;
  content: string;
  accessLevel: "private" | "ai_eligible";
  includeInHandoff: boolean;
};

export type SaveSupportNoteResult =
  | { ok: true }
  | { ok: false; reason: "locked" | "unavailable" };

/**
 * Posts one approved support note. Does not write on 423, and does not
 * treat a missing diary route as a saved note.
 */
export async function saveSupportNote(
  input: SupportNoteInput,
): Promise<SaveSupportNoteResult> {
  let response: Response;
  try {
    response = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: "support_note",
        title: input.title.trim().length > 0 ? input.title.trim() : null,
        content: input.content.trim(),
        accessLevel: input.accessLevel,
        includeInHandoff: input.includeInHandoff,
        tags: [],
        mood: null,
      }),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.status === 423) {
    return { ok: false, reason: "locked" };
  }
  if (!response.ok) {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
