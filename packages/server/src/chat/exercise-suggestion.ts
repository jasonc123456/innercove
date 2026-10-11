import { SuggestedExerciseSchema, type ExerciseSuggestionId, type SuggestedExercise } from "@innercove/core";

/**
 * Conservative, explainable wellness-exercise policy. It is separate from
 * crisis detection: callers must provide the tier and tier 1/2 always wins.
 * This detects possible expressed stress, never a condition or diagnosis.
 */
const STRESS_CONTEXT = /\b(?:feel(?:ing)?|been|am|i'm|mind|body|chest|shoulders?)\b/i;
const STRESS_SIGNAL = /\b(?:overwhelmed|stressed|stress(?:ed)? out|tense|tension|nervous|on edge|mind (?:won't|will not) slow|racing thoughts?|anxious)\b/i;
const BREATH_DISCOMFORT = /\b(?:hold(?:ing)? (?:my )?breath|breath[- ]holding)[^.?!]{0,80}\b(?:uncomfortable|difficult|scary|worse|panic|dizzy)\b|\b(?:breathing exercise|breathwork)[^.?!]{0,80}\b(?:uncomfortable|difficult|scary|worse|panic|dizzy)\b/i;
const DECLINE = /\b(?:no thanks|don't want|do not want|not now|rather not|stop (?:suggesting|offering))\b/i;

const EXERCISES: Record<ExerciseSuggestionId, SuggestedExercise> = {
  breathing478: {
    id: "breathing478",
    title: "Guided 4-7-8 breathing",
    route: "/exercises/breathing",
    reason: "Optional relaxation exercise suggested in response to expressed stress",
  },
  "comfortable-breathing": {
    id: "comfortable-breathing",
    title: "Comfortable paced breathing",
    route: "/exercises/breathing",
    reason: "Optional no-hold breathing exercise suggested in response to expressed stress",
  },
};

export function suggestExercise(input: {
  message: string;
  safetyTier: 0 | 1 | 2;
  dismissedIds: readonly ExerciseSuggestionId[];
  recentHistory: readonly { role: "user" | "assistant"; content: string }[];
}): SuggestedExercise | null {
  if (input.safetyTier !== 0 || DECLINE.test(input.message)) return null;
  if (!STRESS_CONTEXT.test(input.message) || !STRESS_SIGNAL.test(input.message)) return null;

  const id: ExerciseSuggestionId = BREATH_DISCOMFORT.test(input.message)
    ? "comfortable-breathing"
    : "breathing478";
  if (input.dismissedIds.includes(id)) return null;

  // Avoid repeating a suggestion in consecutive turns, including model prose
  // produced before the structured event existed.
  const lastAssistant = [...input.recentHistory].reverse().find((item) => item.role === "assistant");
  if (lastAssistant && /breath(?:ing)? exercise|guided breathing|comfortable paced breathing/i.test(lastAssistant.content)) {
    return null;
  }
  return SuggestedExerciseSchema.parse(EXERCISES[id]);
}
