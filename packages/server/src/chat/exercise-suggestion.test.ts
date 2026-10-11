import { describe, expect, it } from "vitest";
import { suggestExercise } from "./exercise-suggestion.js";

const base = { dismissedIds: [], recentHistory: [] as { role: "user" | "assistant"; content: string }[] };

describe("exercise suggestion policy", () => {
  it("suggests an optional breathing exercise for clear expressed stress", () => {
    expect(suggestExercise({ ...base, message: "I am feeling overwhelmed and my mind won't slow down.", safetyTier: 0 })?.id).toBe("breathing478");
  });

  it("does not turn a single condition word or ordinary sadness into a suggestion", () => {
    expect(suggestExercise({ ...base, message: "Anxiety is a word I heard in class.", safetyTier: 0 })).toBeNull();
    expect(suggestExercise({ ...base, message: "I miss my friend today.", safetyTier: 0 })).toBeNull();
  });

  it("uses the no-hold option when breath-holding feels uncomfortable", () => {
    expect(suggestExercise({ ...base, message: "I am tense and holding my breath feels uncomfortable.", safetyTier: 0 })?.id).toBe("comfortable-breathing");
  });

  it("honors dismissal and never suggests a normal exercise during crisis tiers", () => {
    expect(suggestExercise({ ...base, message: "I feel overwhelmed and stressed.", safetyTier: 0, dismissedIds: ["breathing478"] })).toBeNull();
    expect(suggestExercise({ ...base, message: "I feel overwhelmed and stressed.", safetyTier: 1 })).toBeNull();
    expect(suggestExercise({ ...base, message: "I feel overwhelmed and stressed.", safetyTier: 2 })).toBeNull();
  });

  it("avoids consecutive offers and validates the server-owned route", () => {
    expect(suggestExercise({ ...base, message: "I am overwhelmed and tense.", safetyTier: 0, recentHistory: [{ role: "assistant", content: "Would you like a breathing exercise?" }] })).toBeNull();
    expect(suggestExercise({ ...base, message: "I am overwhelmed and tense.", safetyTier: 0 })?.route).toBe("/exercises/breathing");
  });
});
