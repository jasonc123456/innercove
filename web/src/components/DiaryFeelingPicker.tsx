import { useId, useState, type KeyboardEvent } from "react";

const FEELINGS = [
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "sad", label: "Sad", emoji: "😔" },
  { id: "energetic", label: "Energetic", emoji: "⚡" },
  { id: "exhausted", label: "Exhausted", emoji: "😩" },
  { id: "calm", label: "Calm", emoji: "😌" },
  { id: "anxious", label: "Anxious", emoji: "😰" },
  { id: "excited", label: "Excited", emoji: "🤩" },
  { id: "stressed", label: "Stressed", emoji: "😣" },
  { id: "loved", label: "Loved", emoji: "🥰" },
  { id: "angry", label: "Angry", emoji: "😠" },
  { id: "grateful", label: "Grateful", emoji: "🙏" },
  { id: "lonely", label: "Lonely", emoji: "😞" },
  { id: "hopeful", label: "Hopeful", emoji: "🌱" },
  { id: "confused", label: "Confused", emoji: "😕" },
  { id: "confident", label: "Confident", emoji: "😎" },
  { id: "overwhelmed", label: "Overwhelmed", emoji: "🫠" },
  { id: "content", label: "Content", emoji: "🙂" },
  { id: "sleepy", label: "Sleepy", emoji: "😴" },
  { id: "neutral", label: "Neutral", emoji: "😐" },
  { id: "frustrated", label: "Frustrated", emoji: "😤" },
] as const;

export type DiaryFeelingId = (typeof FEELINGS)[number]["id"];

/** The feeling is stored as one `feeling:<id>` tag, so it needs no new column and reaches the AI with the entry. */
const FEELING_TAG = "feeling:";

export function feelingFromTags(tags: readonly string[]): (typeof FEELINGS)[number] | null {
  const tag = tags.find((t) => t.startsWith(FEELING_TAG));
  return FEELINGS.find((feeling) => FEELING_TAG + feeling.id === tag) ?? null;
}

export function tagsWithFeeling(tags: readonly string[], feeling: DiaryFeelingId | null): string[] {
  const rest = tags.filter((t) => !t.startsWith(FEELING_TAG));
  return feeling ? [...rest, FEELING_TAG + feeling] : rest;
}

function columnCount(buttons: HTMLButtonElement[]): number {
  const top = buttons[0]?.offsetTop ?? 0;
  let count = 0;
  for (const button of buttons) {
    if (Math.abs(button.offsetTop - top) > 2) break;
    count += 1;
  }
  return Math.max(1, count);
}

/** Optional, one-at-a-time feeling, saved with the entry (as a tag) and shown to the AI when it may use the entry. */
export function DiaryFeelingPicker({
  value,
  onChange,
}: {
  value: DiaryFeelingId | null;
  onChange: (next: DiaryFeelingId | null) => void;
}) {
  const labelId = useId();
  const noteId = useId();
  const [tabStop, setTabStop] = useState<DiaryFeelingId>(FEELINGS[0].id);
  const selected = FEELINGS.find((feeling) => feeling.id === value) ?? null;
  const stop = value ?? tabStop;

  function choose(id: DiaryFeelingId) {
    if (value === id) {
      setTabStop(id);
      onChange(null);
      return;
    }
    onChange(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.getAttribute("role") !== "radio") {
      return;
    }
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const index = buttons.indexOf(target);
    if (index < 0) return;
    const cols = columnCount(buttons);
    const rowStart = Math.floor(index / cols) * cols;
    const rowEnd = Math.min(rowStart + cols, buttons.length) - 1;
    let next = index;
    if (event.key === "ArrowRight") next = index >= rowEnd ? rowStart : index + 1;
    else if (event.key === "ArrowLeft") next = index <= rowStart ? rowEnd : index - 1;
    else if (event.key === "ArrowDown") next = index + cols < buttons.length ? index + cols : index;
    else if (event.key === "ArrowUp") next = index - cols >= 0 ? index - cols : index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    const nextFeeling = FEELINGS.find((feeling) => feeling.id === buttons[next]?.dataset.feeling);
    if (!nextFeeling) return;
    onChange(nextFeeling.id);
    buttons[next]?.focus();
  }

  return (
    <div className="feeling-picker flex flex-col gap-2 rounded-2xl border p-3">
      <p id={labelId} className="text-sm leading-snug">
        How are you feeling today? (Optional)
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={noteId}
        className="grid grid-cols-2 gap-2 min-[24rem]:grid-cols-4 lg:grid-cols-5"
        onKeyDown={onKeyDown}
      >
        {FEELINGS.map((feeling) => {
          const checked = value === feeling.id;
          return (
            <button
              key={feeling.id}
              type="button"
              role="radio"
              aria-checked={checked}
              data-feeling={feeling.id}
              tabIndex={feeling.id === stop ? 0 : -1}
              onClick={() => choose(feeling.id)}
              className="feeling-option flex min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center"
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {feeling.emoji}
              </span>
              <span className="feeling-option-label text-xs leading-tight">{feeling.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p id={noteId} className="feeling-note text-xs leading-snug" role="status">
          {selected
            ? `${selected.label} selected. Saved with the entry.`
            : "No feeling selected."}
        </p>
        <button
          type="button"
          className="feeling-clear inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border px-4 text-sm"
          aria-label="Clear feeling"
          disabled={value === null}
          onClick={() => {
            if (value) setTabStop(value);
            onChange(null);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
