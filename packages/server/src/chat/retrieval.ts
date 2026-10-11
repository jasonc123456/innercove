import type {
  DiaryEntryCandidate,
  DiaryMemoryReadPort,
  MemoryCandidateWithProvenance,
  UserId,
} from "@innercove/core";

/** One item chosen for the prompt. `text` is exactly what the model sees (the "sent" panel shows it verbatim). */
export interface ContextItem {
  type: "memory" | "diary_entry";
  id: string;
  title: string;
  /** ISO date for diary entries. */
  date?: string;
  text: string;
  /** Matched the user's message by keyword. Used with the reply to decide what this exchange drew on (D33). */
  relevant: boolean;
}

export interface RetrievalLimits {
  memories: number;
  diaryEntries: number;
  /** Diary text is cut to this many characters to bound prompt size and prefill time. */
  diaryChars: number;
  /** Upper bound on candidates read from the port per type. */
  maxCandidates: number;
}

/** D49: every memory the AI may use goes in (it decides what helps); diary entries are capped for prefill time. */
export const DEFAULT_LIMITS: RetrievalLimits = { memories: 40, diaryEntries: 6, diaryChars: 800, maxCandidates: 1000 };

export interface EligiblePool {
  memories: MemoryCandidateWithProvenance[];
  diaryEntries: DiaryEntryCandidate[];
}

/**
 * Reads the eligible pool through B's port (already filtered per §3c), then
 * re-checks the fields A can see so a faulty port fails closed rather than leaking.
 */
export async function loadEligiblePool(
  port: DiaryMemoryReadPort,
  userId: UserId,
  limits: RetrievalLimits = DEFAULT_LIMITS,
): Promise<EligiblePool> {
  const page = 200;
  const memories: MemoryCandidateWithProvenance[] = [];
  for (let cursor: MemoryCandidateWithProvenance["id"] | undefined; memories.length < limits.maxCandidates; ) {
    const rows = await port.listMemoryCandidates({ userId, limit: page, ...(cursor ? { cursor } : {}) });
    memories.push(...rows);
    if (rows.length < page) break;
    cursor = rows.at(-1)!.id;
  }
  const diaryEntries: DiaryEntryCandidate[] = [];
  for (let cursor: DiaryEntryCandidate["id"] | undefined; diaryEntries.length < limits.maxCandidates; ) {
    const rows = await port.listDiaryCandidates({ userId, limit: page, ...(cursor ? { cursor } : {}) });
    diaryEntries.push(...rows);
    if (rows.length < page) break;
    cursor = rows.at(-1)!.id;
  }
  return {
    memories: memories.filter((m) => m.userId === userId && m.accessLevel === "ai_eligible" && m.status === "approved"),
    diaryEntries: diaryEntries.filter((d) => d.userId === userId && d.accessLevel === "ai_eligible"),
  };
}

/** IDs of every source the AI may currently use; anything else counts as revoked for D33. */
export function eligibleIds(pool: EligiblePool): Set<string> {
  return new Set([...pool.memories.map((m) => m.id), ...pool.diaryEntries.map((d) => d.id)]);
}

/**
 * D49 (supersedes D27's top-N rule): every eligible memory, pinned first, then the
 * ones matching the message, then the most recent; the model decides which help.
 * Diary entries the user shared: matching ones first, then the most recent.
 */
export function selectContext(
  pool: EligiblePool,
  message: string,
  pinnedMemoryIds: readonly string[] = [],
  limits: RetrievalLimits = DEFAULT_LIMITS,
): ContextItem[] {
  const query = new Set(terms(message));
  const pinned = new Set(pinnedMemoryIds);
  const docs = [
    ...pool.memories.map((m) => ({ kind: "memory" as const, record: m, terms: terms(m.content) })),
    ...pool.diaryEntries.map((d) => ({
      kind: "diary_entry" as const,
      record: d,
      terms: terms(`${d.title ?? ""} ${d.content} ${d.tags.join(" ")}`),
    })),
  ];
  const df = new Map<string, number>();
  for (const doc of docs) for (const t of new Set(doc.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const score = (docTerms: string[]) => {
    const present = new Set(docTerms);
    let s = 0;
    for (const t of query) if (present.has(t)) s += Math.log(1 + docs.length / (df.get(t) ?? 1));
    return s;
  };
  const ordered = <T extends { record: { id: string; updatedAt: string } }>(items: (T & { terms: string[] })[]) =>
    items
      .map((item) => ({ item, s: score(item.terms), pin: pinned.has(item.record.id) ? 1 : 0 }))
      .sort((a, b) => b.pin - a.pin || b.s - a.s || b.item.record.updatedAt.localeCompare(a.item.record.updatedAt));

  const memories = ordered(docs.filter((d) => d.kind === "memory")).slice(0, limits.memories);
  const diary = ordered(docs.filter((d) => d.kind === "diary_entry")).slice(0, limits.diaryEntries);

  return [
    ...memories.map(({ item, s }): ContextItem => {
      const m = item.record as MemoryCandidateWithProvenance;
      return { type: "memory", id: m.id, title: shorten(m.content, 60), text: m.content, relevant: s > 0 };
    }),
    ...diary.map(({ item, s }): ContextItem => {
      const d = item.record as DiaryEntryCandidate;
      return {
        type: "diary_entry",
        id: d.id,
        title: d.title ?? d.createdAt.slice(0, 10),
        date: d.createdAt.slice(0, 10),
        text: shorten(d.content, limits.diaryChars),
        relevant: s > 0,
      };
    }),
  ];
}

/**
 * The items an exchange drew on, for `message_context` and so D33: ones matching the
 * message, plus ones the reply echoes. Everything is sent (D49), but recording all of
 * it would make excluding one memory hide the whole conversation from the model.
 */
export function usedContext(context: readonly ContextItem[], reply: string): ContextItem[] {
  const replyTerms = new Set(terms(reply));
  return context.filter((item) => {
    if (item.relevant) return true;
    const itemTerms = new Set(terms(item.text));
    let shared = 0;
    for (const t of itemTerms) if (replyTerms.has(t)) shared++;
    return shared >= Math.min(2, itemTerms.size);
  });
}

const STOPWORDS = new Set(
  (
    "the and for that with this have has had was were are you your yours they them their there then than what when where " +
    "which who whom why how not but all any can could would should will just about from into onto over under again also " +
    "been being did does doing done its it's i'm im ive i've i'd id dont don't didn't cant can't wont won't isn't wasn't " +
    "aren't really very much more most some such only own same too out off our ours she her hers him his himself herself " +
    "myself yourself today yesterday tomorrow still even like feel feels feeling felt know think thing things get got " +
    "going want wanted need needs make made lot lots way well back time day days week weeks one two"
  ).split(" "),
);

/** Lowercased content words with light stemming; short words and stopwords are dropped. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
    .map((w) => w.replace(/'s$/, "").replace(/'/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stem);
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
