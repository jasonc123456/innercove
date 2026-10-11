import { useEffect, useMemo, useState } from "react";
import type { AccessLevel, DiaryEntry, PracticeMemory } from "../session/AppSession";
import { useTimeZone } from "../timeZone";
import { feelingFromTags } from "./DiaryFeelingPicker";

type Kind = "diary" | "memories";
type Item = {
  id: string;
  createdAt: string;
  updatedAt: string;
  accessLevel: AccessLevel;
  content: string;
  title: string | null;
  feeling: string | null;
  supportNote: boolean;
};

/** Every page of the list (the API returns at most 100 per page). Nothing is cached or logged. */
async function fetchAll(kind: Kind): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | null = null;
  do {
    const base = kind === "diary" ? "/api/diary?limit=100" : "/api/memories?status=approved&limit=100";
    const res = await fetch(cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base);
    if (res.status === 423) throw new Error("The hub is locked. Sign in again to export.");
    if (!res.ok) throw new Error("The hub didn't answer. Nothing was exported.");
    const body = (await res.json()) as {
      entries?: DiaryEntry[];
      memories?: PracticeMemory[];
      nextCursor: string | null;
    };
    for (const entry of body.entries ?? []) {
      items.push({
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        accessLevel: entry.accessLevel,
        content: entry.content,
        title: entry.title,
        feeling: feelingFromTags(entry.tags)?.label ?? null,
        supportNote: entry.origin === "support_note",
      });
    }
    for (const memory of body.memories ?? []) {
      items.push({
        id: memory.id,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        accessLevel: memory.accessLevel,
        content: memory.content,
        title: null,
        feeling: null,
        supportNote: false,
      });
    }
    cursor = body.nextCursor;
  } while (cursor);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** "2026-10-11" for an instant, in the chosen zone, so the range matches the dates the user sees. */
function dayIn(zone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

function daysAgo(zone: string, days: number): string {
  return dayIn(zone, new Date(Date.now() - days * 86_400_000).toISOString());
}

/**
 * Export diary entries or memories to a file the user saves: pick a date range, untick
 * anything to leave out, then download Markdown (to read or share) or JSON (data).
 * Built in the browser from the hub's API; the file itself is not encrypted.
 */
export function ExportPanel({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const { zone, formatDateTime, formatDate } = useTimeZone();
  const [items, setItems] = useState<Item[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(() => dayIn(zone, new Date().toISOString()));
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [format, setFormat] = useState<"md" | "json">("md");
  const noun = kind === "diary" ? "entries" : "memories";

  useEffect(() => {
    let live = true;
    fetchAll(kind)
      .then((all) => {
        if (!live) return;
        setItems(all);
        if (all.length) setFrom(dayIn(zone, all[all.length - 1].createdAt));
      })
      .catch((error: Error) => live && setProblem(error.message));
    return () => {
      live = false;
    };
    // The zone only sets the first "From" value; changing it later keeps the user's range.
  }, [kind]);

  const inRange = useMemo(
    () =>
      (items ?? []).filter((item) => {
        const day = dayIn(zone, item.createdAt);
        return (!from || day >= from) && (!to || day <= to);
      }),
    [items, zone, from, to],
  );
  const chosen = inRange.filter((item) => !excluded.has(item.id));

  function toggle(id: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(include: boolean) {
    setExcluded((current) => {
      const next = new Set(current);
      for (const item of inRange) {
        if (include) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  function download() {
    const range = `${from || "start"}-to-${to || dayIn(zone, new Date().toISOString())}`;
    const name = `innercove-${kind}-${range}.${format}`;
    const text = format === "json" ? asJson() : asMarkdown();
    const url = URL.createObjectURL(
      new Blob([text], { type: format === "json" ? "application/json" : "text/markdown" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    // Firefox only follows a download link that is in the document.
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function asJson(): string {
    return JSON.stringify(
      {
        format: "innercove-export",
        version: 1,
        kind,
        exportedAt: new Date().toISOString(),
        timeZone: zone,
        from: from || null,
        to: to || null,
        items: chosen.map((item) =>
          kind === "diary"
            ? {
                id: item.id,
                title: item.title,
                feeling: item.feeling,
                supportNote: item.supportNote,
                content: item.content,
                aiMayUse: item.accessLevel === "ai_eligible",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              }
            : {
                id: item.id,
                content: item.content,
                aiMayUse: item.accessLevel === "ai_eligible",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              },
        ),
      },
      null,
      2,
    );
  }

  function asMarkdown(): string {
    const heading = kind === "diary" ? "InnerCove diary" : "What InnerCove remembers";
    const lines = [
      `# ${heading}`,
      "",
      `Exported ${formatDateTime(new Date().toISOString())} · ${from || "start"} to ${to} · ${chosen.length} ${noun}`,
      "",
    ];
    for (const item of chosen) {
      if (kind === "diary") {
        const meta = [
          formatDateTime(item.createdAt),
          item.feeling ? `Feeling: ${item.feeling}` : null,
          item.supportNote ? "Support note" : null,
        ].filter(Boolean);
        lines.push(`## ${item.title ?? "Untitled"}`, "", `_${meta.join(" · ")}_`, "", item.content, "");
      } else {
        lines.push(`- ${item.content} _(${formatDate(item.createdAt)})_`);
      }
    }
    return lines.join("\n") + "\n";
  }

  const quick = (label: string, days: number | null) => (
    <button
      type="button"
      onClick={() => {
        setFrom(days === null ? (items?.length ? dayIn(zone, items[items.length - 1].createdAt) : "") : daysAgo(zone, days));
        setTo(dayIn(zone, new Date().toISOString()));
      }}
      className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm text-ink"
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto page-x px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
          Export {kind === "diary" ? "diary" : "memories"}
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-4 text-base text-ink"
        >
          Back
        </button>
      </div>
      <p className="text-sm leading-relaxed text-ink/80">
        Choose dates, untick anything you want to leave out, then download. The file is not encrypted:
        anyone who has it can read it, so keep it somewhere private and delete it once you&rsquo;ve shared it.
      </p>

      {problem ? (
        <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink" role="alert">
          {problem}
        </p>
      ) : items === null ? (
        <p className="text-base text-ink/75" role="status">
          Loading…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink/80">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                className="h-11 rounded-2xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-cove"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/80">
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className="h-11 rounded-2xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-cove"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick("Last 7 days", 6)}
            {quick("Last 30 days", 29)}
            {quick("All dates", null)}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink/80" role="status">
              {chosen.length} of {inRange.length} {noun} in this range selected
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAll(true)} className="text-sm text-cove underline">
                Select all
              </button>
              <button type="button" onClick={() => setAll(false)} className="text-sm text-cove underline">
                Select none
              </button>
            </div>
          </div>

          {inRange.length === 0 ? (
            <p className="text-base text-ink/75">Nothing in this date range.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {inRange.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-foam px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!excluded.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 size-5 shrink-0"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-2 text-base text-ink">
                        {kind === "diary" ? (item.title ?? "Untitled") : item.content}
                      </span>
                      <span className="text-xs text-ink/60">
                        {[
                          kind === "diary" ? formatDateTime(item.createdAt) : formatDate(item.createdAt),
                          item.feeling,
                          item.supportNote ? "Support note" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-ink/80">Format</legend>
            <label className="flex min-h-11 items-center gap-3 text-base text-ink">
              <input type="radio" name="export-format" checked={format === "md"} onChange={() => setFormat("md")} className="size-5" />
              Readable (Markdown), to read or share
            </label>
            <label className="flex min-h-11 items-center gap-3 text-base text-ink">
              <input type="radio" name="export-format" checked={format === "json"} onChange={() => setFormat("json")} className="size-5" />
              Data (JSON)
            </label>
          </fieldset>

          <button
            type="button"
            onClick={download}
            disabled={chosen.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white disabled:opacity-60"
          >
            Download {chosen.length} {chosen.length === 1 ? (kind === "diary" ? "entry" : "memory") : noun}
          </button>
        </>
      )}
    </div>
  );
}
